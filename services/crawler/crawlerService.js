const { chromium } = require("playwright");

const { extractPageData } = require("./html.extractor");
const { classifyLinks } = require("./link.classifier");
const { crawlProductPage } = require("./product.crawler");

const MAX_PRODUCTS = 3;

const MAX_CRAWL_TIME = 180000; // 3 minutes

const PRODUCT_CONCURRENCY = 3;

// Initial navigation only needs the document to commit.
// DOMContentLoaded/networkidle are handled separately.
const HOMEPAGE_NAVIGATION_TIMEOUT = 30000;

const DOM_CONTENT_LOADED_TIMEOUT = 10000;

const NETWORK_IDLE_TIMEOUT = 5000;

const SETTLE_DELAY = 700;

const MAX_HTML_SIZE = 5 * 1024 * 1024;


/* =========================================================
   HELPERS
========================================================= */

const sleep = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms));


const normalizeHostname = (hostname) =>
    hostname.replace(/^www\./, "").toLowerCase();


const isHttpUrl = (url) => {
    try {
        const parsed = new URL(url);

        return (
            parsed.protocol === "http:" ||
            parsed.protocol === "https:"
        );
    } catch {
        return false;
    }
};


const isSameStoreUrl = (candidateUrl, storeUrl) => {
    try {
        const candidate = new URL(candidateUrl);
        const store = new URL(storeUrl);

        return (
            normalizeHostname(candidate.hostname) ===
            normalizeHostname(store.hostname)
        );
    } catch {
        return false;
    }
};


const normalizeUrl = (url) => {
    try {
        const parsed = new URL(url);

        parsed.hash = "";

        return parsed.toString().replace(/\/$/, "");
    } catch {
        return null;
    }
};


const uniqueUrls = (urls = []) => {
    const seen = new Set();
    const result = [];

    for (const url of urls) {
        const normalized = normalizeUrl(url);

        if (!normalized) continue;

        if (seen.has(normalized)) continue;

        seen.add(normalized);

        result.push(normalized);
    }

    return result;
};


/* =========================================================
   CONCURRENCY
========================================================= */

const runWithConcurrency = async (
    items,
    concurrency,
    worker,
    deadline
) => {
    const results = new Array(items.length);

    let nextIndex = 0;

    const runWorker = async () => {
        while (true) {

            if (Date.now() >= deadline) {
                return;
            }

            const index = nextIndex++;

            if (index >= items.length) {
                return;
            }

            const item = items[index];

            try {

                results[index] =
                    await worker(item);

            } catch (error) {

                results[index] = {
                    success: false,
                    error: error.message,
                    url: item
                };
            }
        }
    };


    const workers = [];

    const workerCount = Math.min(
        concurrency,
        items.length
    );


    for (
        let i = 0;
        i < workerCount;
        i++
    ) {
        workers.push(runWorker());
    }


    await Promise.all(workers);

    return results;
};


/* =========================================================
   HOMEPAGE REQUEST PROTECTION
========================================================= */

const setupHomepageProtection = async (
    page,
    storeUrl
) => {

    await page.route(
        "**/*",
        async (route) => {

            const request =
                route.request();

            const type =
                request.resourceType();

            const url =
                request.url();


            // Only allow HTTP/HTTPS
            if (!isHttpUrl(url)) {

                await route.abort();

                return;
            }


            // Fonts and media are unnecessary
            // for HTML auditing.
            if (
                type === "font" ||
                type === "media"
            ) {

                await route.abort();

                return;
            }


            // Prevent top-level navigation
            // from leaving the store.
            if (
                type === "document" &&
                !isSameStoreUrl(
                    url,
                    storeUrl
                )
            ) {

                await route.abort();

                return;
            }


            await route.continue();
        }
    );


    page.on(
        "requestfailed",
        (request) => {

            const url =
                request.url();


            // Ignore noisy third-party
            // analytics/tracking requests.
            if (
                url.includes("google-analytics") ||
                url.includes("googletagmanager") ||
                url.includes("facebook") ||
                url.includes("doubleclick") ||
                url.includes("clarity") ||
                url.includes("shopifysvc.com") ||
                url.includes("klaviyo.com") ||
                url.includes("shop.app")
            ) {
                return;
            }


            const failure =
                request.failure();


            if (failure) {

                console.log(
                    `Request failed: ${request.resourceType()} ${url}`
                );
            }
        }
    );
};


/* =========================================================
   HOMEPAGE NAVIGATION
========================================================= */

const navigateHomepageSafely = async (
    page,
    storeUrl
) => {

    let navigationTimedOut = false;


    console.log(
        `Opening homepage: ${storeUrl}`
    );


    /*
     * IMPORTANT:
     *
     * Do NOT wait for DOMContentLoaded
     * inside page.goto().
     *
     * Shopify stores can keep scripts,
     * payment widgets, analytics and
     * third-party resources running.
     *
     * "commit" means the document navigation
     * has actually started successfully.
     */

    try {

        await page.goto(
            storeUrl,
            {
                waitUntil: "commit",
                timeout:
                    HOMEPAGE_NAVIGATION_TIMEOUT
            }
        );

    } catch (error) {

        if (
            error.name ===
            "TimeoutError"
        ) {

            navigationTimedOut = true;

            console.log(
                "Homepage navigation timeout — checking whether page committed..."
            );

        } else {

            throw error;
        }
    }


    /*
     * Give the browser a short moment
     * to establish the document.
     */

    await sleep(1500);


    const currentUrl =
        page.url();


    /*
     * about:blank means the document
     * never actually committed.
     */

    if (
        !currentUrl ||
        currentUrl === "about:blank"
    ) {

        throw new Error(
            "Homepage failed to commit: about:blank"
        );
    }


    /*
     * Verify that the final page
     * is still inside the target store.
     */

    if (
        !isSameStoreUrl(
            currentUrl,
            storeUrl
        )
    ) {

        throw new Error(
            "Homepage redirected to a different domain"
        );
    }


    console.log(
        `Homepage committed: ${currentUrl}`
    );


    /*
     * DOMContentLoaded is useful,
     * but NOT required for success.
     */

    try {

        await page.waitForLoadState(
            "domcontentloaded",
            {
                timeout:
                    DOM_CONTENT_LOADED_TIMEOUT
            }
        );

    } catch {

        console.log(
            "Homepage DOMContentLoaded timeout — continuing"
        );
    }


    /*
     * networkidle is also optional.
     *
     * Shopify stores frequently never
     * become completely idle because of
     * analytics/payment/marketing scripts.
     */

    try {

        await page.waitForLoadState(
            "networkidle",
            {
                timeout:
                    NETWORK_IDLE_TIMEOUT
            }
        );

    } catch {

        console.log(
            "Homepage network idle timeout — continuing"
        );
    }


    await sleep(
        SETTLE_DELAY
    );


    /*
     * Get the actual HTML.
     */

    const html =
        await page.content();


    if (
        !html ||
        html.length < 500
    ) {

        throw new Error(
            "Homepage HTML is empty or too small"
        );
    }


    if (
        html.length >
        MAX_HTML_SIZE
    ) {

        throw new Error(
            "Homepage HTML exceeded maximum allowed size"
        );
    }


    console.log(
        `Homepage loaded successfully. HTML size: ${(
            html.length / 1024
        ).toFixed(2)} KB`
    );


    return {
        finalUrl: currentUrl,
        html,
        navigationTimedOut
    };
};


/* =========================================================
   MAIN CRAWLER
========================================================= */

const crawlHomepage = async (
    storeUrl
) => {

    let browser;
    let context;

    const startedAt =
        Date.now();


    const deadline =
        startedAt +
        MAX_CRAWL_TIME;


    try {

        console.log(
            `Launching browser for: ${storeUrl}`
        );


        browser = await chromium.launch({
            channel: "chromium",
            headless: true
        });


        context =
            await browser.newContext({

                viewport: {
                    width: 1440,
                    height: 900
                },

                userAgent:
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36"
            });


        /* =====================================================
           HOMEPAGE
        ===================================================== */

        const page =
            await context.newPage();


        await setupHomepageProtection(
            page,
            storeUrl
        );


        const homepageNavigation =
            await navigateHomepageSafely(
                page,
                storeUrl
            );


        const finalUrl =
            homepageNavigation.finalUrl;


        const html =
            homepageNavigation.html;


        /* =====================================================
           EXTRACT HOMEPAGE DATA
        ===================================================== */

        const homepageData =
            extractPageData(
                html,
                finalUrl
            );


        /* =====================================================
           CLASSIFY LINKS
        ===================================================== */

        const classified =
            classifyLinks(
                homepageData.links?.items || [],
                storeUrl
            );


        /* =====================================================
           PRODUCT URLS
        ===================================================== */

        const productUrls =
            uniqueUrls(
                (classified.products || [])
                    .map(
                        (product) =>
                            product.href
                    )
            )
                .filter(
                    (url) =>
                        isSameStoreUrl(
                            url,
                            storeUrl
                        )
                )
                .slice(
                    0,
                    MAX_PRODUCTS
                );


        console.log(
            `Discovered ${productUrls.length} product URLs`
        );


        /* =====================================================
           CLOSE HOMEPAGE
        ===================================================== */

        await page.close();


        /* =====================================================
           PRODUCT CRAWLING
        ===================================================== */

        let productResults = [];


        if (
            productUrls.length > 0 &&
            Date.now() < deadline
        ) {

            console.log(
                `Starting product crawl: ${productUrls.length} products`
            );


            productResults =
                await runWithConcurrency(

                    productUrls,

                    PRODUCT_CONCURRENCY,

                    async (productUrl) => {

                        console.log(
                            `Crawling product: ${productUrl}`
                        );


                        return await crawlProductPage(
                            productUrl,
                            context,
                            storeUrl
                        );
                    },

                    deadline
                );
        }


        /* =====================================================
           NORMALIZE PRODUCT RESULTS
        ===================================================== */

        const successfulProducts =
            productResults.filter(
                (result) =>
                    result &&
                    result.success
            );


        console.log(
            `Products crawled successfully: ${successfulProducts.length}/${productUrls.length}`
        );


        /* =====================================================
           FINAL RESULT
        ===================================================== */

        return {

            success: true,

            data: {

                requestedUrl:
                    storeUrl,

                finalUrl,

                title:
                    homepageData.title ||
                    null,

                storeName:
                    homepageData.storeName ||
                    null,

                homepage:
                    homepageData,

                discoveredPages: {

                    products:
                        productUrls
                },

                products: {

                    crawled:
                        successfulProducts.length,

                    limit:
                        MAX_PRODUCTS,

                    items:
                        successfulProducts
                }
            }
        };


    } catch (error) {

        console.error(
            "Website crawl failed:",
            error
        );


        return {

            success: false,

            message:
                error.message ||
                "Website crawl failed"
        };


    } finally {

        if (context) {

            try {
                await context.close();
            } catch {}
        }


        if (browser) {

            try {
                await browser.close();
            } catch {}
        }


        console.log(
            "Browser/context closed"
        );
    }
};


module.exports = {
    crawlHomepage
};