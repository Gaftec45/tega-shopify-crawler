const { chromium } = require("playwright");

const { extractPageData } = require("./html.extractor");
const { classifyLinks } = require("./link.classifier");
const { crawlProductPage } = require("./product.crawler");

const MAX_PRODUCTS = 3;

const MAX_CRAWL_TIME = 180000; // 3 minutes

const PRODUCT_CONCURRENCY = 1;

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
    hostname
        .replace(/^www\./, "")
        .toLowerCase();


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


const isSameStoreUrl = (
    candidateUrl,
    storeUrl
) => {
    try {
        const candidate =
            new URL(candidateUrl);

        const store =
            new URL(storeUrl);

        return (
            normalizeHostname(
                candidate.hostname
            ) ===
            normalizeHostname(
                store.hostname
            )
        );

    } catch {
        return false;
    }
};


const normalizeUrl = (url) => {
    try {
        const parsed =
            new URL(url);

        parsed.hash = "";

        return parsed
            .toString()
            .replace(/\/$/, "");

    } catch {
        return null;
    }
};


const uniqueUrls = (urls = []) => {

    const seen = new Set();

    const result = [];

    for (const url of urls) {

        const normalized =
            normalizeUrl(url);

        if (!normalized) {
            continue;
        }

        if (seen.has(normalized)) {
            continue;
        }

        seen.add(normalized);

        result.push(normalized);
    }

    return result;
};


/* =========================================================
   SAFE PROGRESS REPORTER
========================================================= */

/*
 * Progress reporting must NEVER break
 * the actual crawl.
 *
 * If MongoDB or another progress operation
 * fails, crawling continues normally.
 */

const reportProgress = async (
    onProgress,
    progress,
    currentStep,
    message = null
) => {

    if (
        typeof onProgress !==
        "function"
    ) {
        return;
    }

    try {

        await onProgress(
            progress,
            currentStep,
            message
        );

    } catch (error) {

        console.error(
            "Progress update failed:",
            error.message
        );
    }
};


/* =========================================================
   CONCURRENCY
========================================================= */

const runWithConcurrency = async (
    items,
    concurrency,
    worker,
    deadline,
    onItemComplete
) => {

    const results =
        new Array(items.length);

    let nextIndex = 0;


    const runWorker = async () => {

        while (true) {

            // Stop starting new work after deadline.
            if (
                Date.now() >= deadline
            ) {
                return;
            }


            const index =
                nextIndex++;


            if (
                index >= items.length
            ) {
                return;
            }


            const item =
                items[index];


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


            /*
             * Report completed item.
             */

            if (
                typeof onItemComplete ===
                "function"
            ) {

                try {

                    await onItemComplete(
                        index,
                        item,
                        results[index]
                    );

                } catch (error) {

                    console.error(
                        "Item progress callback failed:",
                        error.message
                    );
                }
            }
        }
    };


    const workers = [];

    const workerCount =
        Math.min(
            concurrency,
            items.length
        );


    for (
        let i = 0;
        i < workerCount;
        i++
    ) {

        workers.push(
            runWorker()
        );
    }


    await Promise.all(
        workers
    );


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


            /*
             * Only allow HTTP/HTTPS.
             */

            if (
                !isHttpUrl(url)
            ) {

                await route.abort();

                return;
            }


            /*
             * Fonts and media are unnecessary
             * for the audit.
             */

            if (
                type === "font" ||
                type === "media"
            ) {

                await route.abort();

                return;
            }


            /*
             * Prevent the homepage from
             * navigating to another domain.
             */

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


    /*
     * Log meaningful failed requests while
     * ignoring common third-party services.
     */

    page.on(
        "requestfailed",
        (request) => {

            const url =
                request.url();


            if (
                url.includes(
                    "google-analytics"
                ) ||
                url.includes(
                    "googletagmanager"
                ) ||
                url.includes(
                    "facebook"
                ) ||
                url.includes(
                    "doubleclick"
                ) ||
                url.includes(
                    "clarity"
                ) ||
                url.includes(
                    "shopifysvc.com"
                ) ||
                url.includes(
                    "klaviyo.com"
                ) ||
                url.includes(
                    "shop.app"
                )
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

    let navigationTimedOut =
        false;


    console.log(
        `Opening homepage: ${storeUrl}`
    );


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

            navigationTimedOut =
                true;

            console.log(
                "Homepage navigation timeout — checking whether page committed..."
            );

        } else {

            throw error;
        }
    }


    /*
     * Give Shopify/JavaScript a moment
     * to render the initial page.
     */

    await sleep(1500);


    const currentUrl =
        page.url();


    if (
        !currentUrl ||
        currentUrl ===
            "about:blank"
    ) {

        throw new Error(
            "Homepage failed to commit: about:blank"
        );
    }


    /*
     * Do not allow redirects outside
     * the store domain.
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
     * DOM content.
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
     * Network idle.
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
    storeUrl,
    onProgress
) => {

    let browser;

    let context;


    const startedAt =
        Date.now();

    const deadline =
        startedAt +
        MAX_CRAWL_TIME;


    try {

        /* ================================================
           START
        ================================================= */

        await reportProgress(
            onProgress,
            10,
            "crawling_homepage",
            "Opening Shopify store..."
        );


        console.log(
            `Launching browser for: ${storeUrl}`
        );


        console.log(
            "Playwright version:",
            require(
                "playwright/package.json"
            ).version
        );


        console.log(
            "PLAYWRIGHT_BROWSERS_PATH:",
            process.env.PLAYWRIGHT_BROWSERS_PATH
        );


        console.log(
            "Launching Chromium..."
        );


        browser =
            await chromium.launch({
                channel: "chromium",
                headless: true
            });


        console.log(
            "Browser launched successfully"
        );


        context =
            await browser.newContext({

                viewport: {
                    width: 1440,
                    height: 900
                },

                userAgent:
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36"
            });


        /* =================================================
           HOMEPAGE
        ================================================= */

        const page =
            await context.newPage();


        await setupHomepageProtection(
            page,
            storeUrl
        );


        await reportProgress(
            onProgress,
            12,
            "crawling_homepage",
            "Connecting to your store..."
        );


        const homepageNavigation =
            await navigateHomepageSafely(
                page,
                storeUrl
            );


        await reportProgress(
            onProgress,
            18,
            "homepage_loaded",
            "Homepage loaded successfully."
        );


        const finalUrl =
            homepageNavigation.finalUrl;

        const html =
            homepageNavigation.html;


        /* =================================================
           EXTRACT HOMEPAGE DATA
        ================================================= */

        await reportProgress(
            onProgress,
            20,
            "extracting_store_data",
            "Extracting store information..."
        );


        const homepageData =
            extractPageData(
                html,
                finalUrl
            );


        await reportProgress(
            onProgress,
            23,
            "extracting_store_data",
            "Store information extracted."
        );


        /* =================================================
           CLASSIFY LINKS
        ================================================= */

        await reportProgress(
            onProgress,
            25,
            "discovering_products",
            "Finding products and important store pages..."
        );


        const classified =
            classifyLinks(
                homepageData.links?.items ||
                    [],
                storeUrl
            );


        /* =================================================
           PRODUCT URLS
        ================================================= */

        const productUrls =
            uniqueUrls(
                (
                    classified.products ||
                    []
                ).map(
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


        await reportProgress(
            onProgress,
            28,
            "products_discovered",
            productUrls.length > 0
                ? `Found ${productUrls.length} product page${productUrls.length > 1 ? "s" : ""} to analyze.`
                : "No product pages were found to crawl."
        );


        /* =================================================
           CLOSE HOMEPAGE
        ================================================= */

        await page.close();


        /* =================================================
           PRODUCT CRAWLING
        ================================================= */

        let productResults = [];


        if (
            productUrls.length > 0 &&
            Date.now() < deadline
        ) {

            console.log(
                `Starting product crawl: ${productUrls.length} products`
            );


            await reportProgress(
                onProgress,
                30,
                "crawling_products",
                `Crawling ${productUrls.length} product page${productUrls.length > 1 ? "s" : ""}...`
            );


            const PRODUCT_START =
                30;

            const PRODUCT_END =
                42;


            productResults =
                await runWithConcurrency(

                    productUrls,

                    PRODUCT_CONCURRENCY,

                    async (
                        productUrl
                    ) => {

                        return await crawlProductPage(
                            productUrl,
                            context,
                            storeUrl
                        );
                    },

                    deadline,

                    async (
                        index,
                        productUrl,
                        result
                    ) => {

                        const completed =
                            index + 1;

                        const total =
                            productUrls.length;


                        const progress =
                            Math.round(
                                PRODUCT_START +
                                (
                                    completed /
                                    total
                                ) *
                                (
                                    PRODUCT_END -
                                    PRODUCT_START
                                )
                            );


                        const success =
                            result?.success;


                        await reportProgress(
                            onProgress,
                            progress,
                            "crawling_products",
                            success
                                ? `Crawled product ${completed} of ${total}.`
                                : `Product ${completed} of ${total} could not be fully crawled.`
                        );


                        console.log(
                            `Product ${completed}/${total} completed: ${productUrl}`
                        );
                    }
                );

        } else {

            await reportProgress(
                onProgress,
                42,
                "crawling_products",
                "No additional product pages to crawl."
            );
        }


        /* =================================================
           NORMALIZE PRODUCT RESULTS
        ================================================= */

        await reportProgress(
            onProgress,
            43,
            "processing_crawl_data",
            "Processing crawled store data..."
        );


        const successfulProducts =
            productResults.filter(
                (result) =>
                    result &&
                    result.success
            );


        console.log(
            `Products crawled successfully: ${successfulProducts.length}/${productUrls.length}`
        );


        /* =================================================
           CRAWL COMPLETE
        ================================================= */

        await reportProgress(
            onProgress,
            45,
            "crawl_completed",
            "Store crawl completed successfully."
        );


        /* =================================================
           FINAL RESULT
        ================================================= */

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