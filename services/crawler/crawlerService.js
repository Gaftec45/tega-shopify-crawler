const { chromium } = require("playwright");

const { extractPageData } = require("./html.extractor");
const { classifyLinks } = require("./link.classifier");
const { crawlProductPage } = require("./product.crawler");
const { extractContactData } = require("./contact.extractor");

/* =========================================================
   CONFIGURATION
========================================================= */

const MAX_PRODUCTS = 5;

const MAX_CONTACT_PAGES = 8;

const MAX_CRAWL_TIME = 180000; // 3 minutes

const PRODUCT_CONCURRENCY = 1;

const HOMEPAGE_NAVIGATION_TIMEOUT = 30000;

const CONTACT_PAGE_NAVIGATION_TIMEOUT = 20000;

const DOM_CONTENT_LOADED_TIMEOUT = 10000;

const NETWORK_IDLE_TIMEOUT = 5000;

const SETTLE_DELAY = 700;

const CONTACT_SETTLE_DELAY = 500;

const MAX_HTML_SIZE = 5 * 1024 * 1024;


/* =========================================================
   HELPERS
========================================================= */

const sleep = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms));


/* =========================================================
   URL NORMALIZATION
========================================================= */

const normalizeHostname = (hostname) => {
    if (!hostname) {
        return "";
    }

    return hostname
        .replace(/^www\./i, "")
        .toLowerCase()
        .trim();
};


const normalizeStoreInput = (input) => {
    if (!input || typeof input !== "string") {
        throw new Error("Store URL is required");
    }

    let value = input.trim();

    /*
     * Support:
     *
     * example.com
     * www.example.com
     * example.myshopify.com
     * https://example.com
     * http://example.com
     */
    if (!/^https?:\/\//i.test(value)) {
        value = `https://${value}`;
    }

    let parsed;

    try {
        parsed = new URL(value);
    } catch {
        throw new Error("Invalid store URL");
    }

    /*
     * Only allow HTTP/HTTPS.
     */
    if (
        parsed.protocol !== "http:" &&
        parsed.protocol !== "https:"
    ) {
        throw new Error(
            "Only HTTP and HTTPS store URLs are supported"
        );
    }

    /*
     * Remove hash.
     */
    parsed.hash = "";

    /*
     * Remove username/password.
     */
    parsed.username = "";
    parsed.password = "";

    /*
     * Remove trailing slash.
     */
    return parsed
        .toString()
        .replace(/\/$/, "");
};


const normalizeUrl = (url, baseUrl = null) => {
    try {
        const parsed = baseUrl
            ? new URL(url, baseUrl)
            : new URL(url);

        /*
         * Only HTTP/HTTPS URLs.
         */
        if (
            parsed.protocol !== "http:" &&
            parsed.protocol !== "https:"
        ) {
            return null;
        }

        /*
         * Remove tracking/query information from
         * discovered page URLs.
         */
        parsed.hash = "";

        return parsed
            .toString()
            .replace(/\/$/, "");

    } catch {
        return null;
    }
};


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
   PLATFORM DETECTION
========================================================= */

/*
 * Detect Shopify from:
 *
 * 1. .myshopify.com domain
 * 2. Shopify HTML fingerprints
 *
 * This allows custom Shopify domains such as:
 *
 * https://www.zweineunneun.com
 *
 * to be detected correctly.
 */

const detectPlatform = (
    storeUrl,
    html = ""
) => {
    try {
        const hostname =
            normalizeHostname(
                new URL(storeUrl).hostname
            );

        /*
         * Shopify hosted domain.
         */
        if (
            hostname.endsWith(
                ".myshopify.com"
            )
        ) {
            return "shopify";
        }

        const htmlLower =
            String(html || "")
                .toLowerCase();

        const shopifySignals = [
            "cdn.shopify.com",
            "cdn.shopifycdn.net",
            "shopify.theme",
            "shopify.routes",
            "shopify-payment-button",
            "/shopify_pay/",
            "ep.shopify_event_name",
            "/cdn/shop/",
            "/cdn/fonts/",
            "shopifyanalytics",
            "shopify.loadfeatures",
            "shopify-section",
            "shopify-section-header"
        ];

        const matchedSignals =
            shopifySignals.filter(
                (signal) =>
                    htmlLower.includes(signal)
            );

        /*
         * Two or more signals gives us
         * reasonable confidence.
         */
        if (
            matchedSignals.length >= 2
        ) {
            return "shopify";
        }

        return "unknown";

    } catch {
        return "unknown";
    }
};


/* =========================================================
   CONTACT PAGE DETECTION
========================================================= */

const isContactPage = (
    url,
    linkText = ""
) => {
    if (!url) {
        return false;
    }

    try {
        const parsed =
            new URL(url);

        const path =
            parsed.pathname.toLowerCase();

        const text =
            String(linkText || "")
                .toLowerCase()
                .trim();

        const contactKeywords = [
            "contact",
            "contact-us",
            "contactus",
            "about",
            "about-us",
            "aboutus",
            "faq",
            "faqs",
            "help",
            "support",
            "customer-service",
            "customer-support",
            "reach-us",
            "get-in-touch",
            "get-in-contact"
        ];

        /*
         * Check URL path.
         */
        const pathMatch =
            contactKeywords.some(
                (keyword) =>
                    path.includes(keyword)
            );

        if (pathMatch) {
            return true;
        }

        /*
         * Check visible link text.
         */
        const textKeywords = [
            "contact us",
            "contact",
            "about us",
            "about",
            "faq",
            "help center",
            "help",
            "support",
            "customer service",
            "customer support",
            "reach us",
            "get in touch"
        ];

        return textKeywords.some(
            (keyword) =>
                text.includes(keyword)
        );

    } catch {
        return false;
    }
};


/* =========================================================
   CONTACT RESULT MERGING
========================================================= */

const mergeContactData = (
    contactMap,
    contactData,
    sourceUrl
) => {
    if (!contactData) {
        return;
    }

    const emails =
        Array.isArray(contactData)
            ? contactData
            : contactData.emails || [];

    for (const item of emails) {
        let email;

        let type = "other";

        let foundOn = [];

        /*
         * Simple string.
         */
        if (
            typeof item === "string"
        ) {
            email =
                item
                    .trim()
                    .toLowerCase();
        }

        /*
         * Object.
         */
        else if (
            item &&
            typeof item === "object"
        ) {
            email =
                typeof item.email === "string"
                    ? item.email
                        .trim()
                        .toLowerCase()
                    : null;

            type =
                item.type ||
                "other";

            foundOn =
                Array.isArray(
                    item.foundOn
                )
                    ? item.foundOn
                    : [];
        }

        if (!email) {
            continue;
        }

        /*
         * Basic validation.
         */
        if (
            !email.includes("@") ||
            !email.includes(".")
        ) {
            continue;
        }

        /*
         * Add current source page.
         */
        if (
            sourceUrl &&
            !foundOn.includes(sourceUrl)
        ) {
            foundOn.push(sourceUrl);
        }

        /*
         * New email.
         */
        if (
            !contactMap.has(email)
        ) {
            contactMap.set(
                email,
                {
                    email,
                    type,
                    foundOn: [
                        ...new Set(foundOn)
                    ]
                }
            );

            continue;
        }

        /*
         * Existing email.
         */
        const existing =
            contactMap.get(email);

        /*
         * Preserve more specific
         * classification.
         */
        if (
            existing.type === "other" &&
            type !== "other"
        ) {
            existing.type = type;
        }

        /*
         * Merge source pages.
         */
        existing.foundOn = [
            ...new Set([
                ...existing.foundOn,
                ...foundOn
            ])
        ];
    }
};


/* =========================================================
   PRIMARY EMAIL
========================================================= */

const getPrimaryEmail = (
    emails = []
) => {
    if (!emails.length) {
        return null;
    }

    /*
     * Outreach priority.
     */
    const priority = [
        "general",
        "business",
        "sales",
        "other",
        "support",
        "orders"
    ];

    for (
        const type
        of priority
    ) {
        const match =
            emails.find(
                (item) =>
                    item.type === type
            );

        if (match) {
            return match.email;
        }
    }

    return emails[0].email;
};


/* =========================================================
   SAFE PROGRESS REPORTER
========================================================= */

const reportProgress = async (
    onProgress,
    progress,
    currentStep,
    message = null
) => {
    if (
        typeof onProgress !== "function"
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
             * Only HTTP/HTTPS.
             */
            if (
                !isHttpUrl(url)
            ) {
                await route.abort();
                return;
            }

            /*
             * Fonts and media aren't needed
             * for the current audit.
             */
            if (
                type === "font" ||
                type === "media"
            ) {
                await route.abort();
                return;
            }

            /*
             * Prevent document navigation
             * outside the store domain.
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
     * Log meaningful failed requests.
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
                ) ||
                url.includes(
                    "analytics.google.com"
                ) ||
                url.includes(
                    "/api/collect"
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
    let navigationTimedOut = false;

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
            navigationTimedOut = true;

            console.log(
                "Homepage navigation timeout — checking whether page committed..."
            );

        } else {
            throw error;
        }
    }

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
   CONTACT PAGE CRAWLER
========================================================= */

const crawlContactPages = async (
    context,
    contactPageUrls,
    storeUrl,
    deadline,
    contactMap,
    homepageHtml,
    homepageUrl
) => {
    const pagesCrawled = [];

    /*
     * First inspect homepage.
     *
     * Shopify stores frequently put
     * email addresses in the footer.
     */
    try {
        const homepageContactData =
            extractContactData(
                homepageHtml,
                homepageUrl
            );

        mergeContactData(
            contactMap,
            homepageContactData,
            homepageUrl
        );

    } catch (error) {
        console.error(
            "Homepage contact extraction failed:",
            error.message
        );
    }

    /*
     * Crawl contact/about/help pages.
     */
    for (
        const contactUrl
        of contactPageUrls
    ) {
        if (
            Date.now() >= deadline
        ) {
            console.log(
                "Crawl deadline reached during contact discovery."
            );

            break;
        }

        let contactPage;

        try {
            contactPage =
                await context.newPage();

            await setupHomepageProtection(
                contactPage,
                storeUrl
            );

            console.log(
                `Opening contact page: ${contactUrl}`
            );

            await contactPage.goto(
                contactUrl,
                {
                    waitUntil:
                        "domcontentloaded",
                    timeout:
                        CONTACT_PAGE_NAVIGATION_TIMEOUT
                }
            );

            await sleep(
                CONTACT_SETTLE_DELAY
            );

            const currentUrl =
                contactPage.url();

            /*
             * Never accept external redirects.
             */
            if (
                !isSameStoreUrl(
                    currentUrl,
                    storeUrl
                )
            ) {
                console.log(
                    `Skipping external contact redirect: ${currentUrl}`
                );

                continue;
            }

            const html =
                await contactPage.content();

            if (
                !html ||
                html.length < 100
            ) {
                console.log(
                    `Contact page HTML too small: ${currentUrl}`
                );

                continue;
            }

            if (
                html.length >
                MAX_HTML_SIZE
            ) {
                console.log(
                    `Contact page HTML too large: ${currentUrl}`
                );

                continue;
            }

            const contactData =
                extractContactData(
                    html,
                    currentUrl
                );

            mergeContactData(
                contactMap,
                contactData,
                currentUrl
            );

            pagesCrawled.push(
                currentUrl
            );

            const pageEmails =
                Array.isArray(
                    contactData?.emails
                )
                    ? contactData.emails.length
                    : Array.isArray(
                        contactData
                    )
                        ? contactData.length
                        : 0;

            console.log(
                `Contact page processed: ${currentUrl} — ${pageEmails} email(s)`
            );

        } catch (error) {
            console.log(
                `Contact page failed: ${contactUrl} — ${error.message}`
            );

        } finally {
            if (contactPage) {
                try {
                    await contactPage.close();
                } catch {}
            }
        }
    }

    return pagesCrawled;
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
           NORMALIZE INPUT
        ================================================= */

        const normalizedStoreUrl =
            normalizeStoreInput(
                storeUrl
            );

        console.log(
            `Normalized store URL: ${normalizedStoreUrl}`
        );


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
            `Launching browser for: ${normalizedStoreUrl}`
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
            normalizedStoreUrl
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
                normalizedStoreUrl
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
           DETECT PLATFORM FROM ACTUAL HTML
        ================================================= */

        const platform =
            detectPlatform(
                finalUrl,
                html
            );

        console.log(
            `Detected platform: ${platform}`
        );


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

        /*
         * Prefer the extractor's platform detection
         * when available.
         */
        const detectedPlatform =
            homepageData.platform &&
            homepageData.platform !== "unknown"
                ? homepageData.platform
                : platform;

        console.log(
            `Final detected platform: ${detectedPlatform}`
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
            "discovering_pages",
            "Finding products and important store pages..."
        );

        const classified =
            classifyLinks(
                homepageData.links?.items ||
                    [],
                finalUrl
            );


        /* =================================================
           PRODUCT URL DISCOVERY
        ================================================= */

        /*
         * Discovery source #1:
         *
         * link.classifier.js
         */
        const classifiedProductUrls =
            (
                classified.products ||
                []
            ).map(
                (product) =>
                    product.href
            );

        /*
         * Discovery source #2:
         *
         * html.extractor.js
         *
         * Handles localized Shopify URLs:
         *
         * /en/products/product-name
         * /de/products/product-name
         * /fr/products/product-name
         */
        const extractedProductUrls =
            (
                homepageData
                    .productDiscovery
                    ?.urls ||
                []
            ).map(
                (product) =>
                    typeof product === "string"
                        ? product
                        : product?.url
            );

        /*
         * Merge both discovery sources.
         */
        const discoveredProductUrls =
            uniqueUrls([
                ...classifiedProductUrls,
                ...extractedProductUrls
            ]);

        /*
         * Keep only URLs belonging to the
         * current store.
         */
        const productUrls =
            discoveredProductUrls
                .filter(
                    (url) =>
                        isSameStoreUrl(
                            url,
                            normalizedStoreUrl
                        )
                )
                .slice(
                    0,
                    MAX_PRODUCTS
                );

        console.log(
            `Product URLs discovered by classifier: ${classifiedProductUrls.length}`
        );

        console.log(
            `Product URLs discovered by extractor: ${extractedProductUrls.length}`
        );

        console.log(
            `Unique product URLs discovered: ${discoveredProductUrls.length}`
        );

        console.log(
            `Product URLs selected for crawling: ${productUrls.length}`
        );

        if (
            productUrls.length > 0
        ) {
            console.log(
                "Product URLs:"
            );

            for (
                const productUrl
                of productUrls
            ) {
                console.log(
                    ` - ${productUrl}`
                );
            }
        }

        await reportProgress(
            onProgress,
            28,
            "products_discovered",
            productUrls.length > 0
                ? `Found ${productUrls.length} product page${productUrls.length > 1 ? "s" : ""} to analyze.`
                : "No product pages were found to crawl."
        );


        /* =================================================
           CONTACT PAGE URLS
        ================================================= */

        const contactLinks =
            (
                homepageData.links?.items ||
                []
            )
                .filter(
                    (link) =>
                        link &&
                        link.href
                )
                .map(
                    (link) => ({
                        ...link,
                        normalizedHref:
                            normalizeUrl(
                                link.href,
                                finalUrl
                            )
                    })
                )
                .filter(
                    (link) =>
                        link.normalizedHref
                )
                .filter(
                    (link) =>
                        isSameStoreUrl(
                            link.normalizedHref,
                            normalizedStoreUrl
                        )
                )
                .filter(
                    (link) =>
                        isContactPage(
                            link.normalizedHref,
                            link.text ||
                            link.label ||
                            link.title ||
                            ""
                        )
                )
                .map(
                    (link) =>
                        link.normalizedHref
                );

        const contactPageUrls =
            uniqueUrls(
                contactLinks
            )
                .slice(
                    0,
                    MAX_CONTACT_PAGES
                );

        console.log(
            `Discovered ${contactPageUrls.length} contact/information pages`
        );

        await reportProgress(
            onProgress,
            29,
            "contact_pages_discovered",
            contactPageUrls.length > 0
                ? `Found ${contactPageUrls.length} contact and information page${contactPageUrls.length > 1 ? "s" : ""}.`
                : "No dedicated contact pages were found. Checking the homepage for contact information."
        );


        /* =================================================
           CLOSE HOMEPAGE
        ================================================= */

        await page.close();


        /* =================================================
           CONTACT / EMAIL DISCOVERY
        ================================================= */

        const contactMap =
            new Map();

        let contactPagesCrawled = [];

        if (
            Date.now() < deadline
        ) {
            await reportProgress(
                onProgress,
                30,
                "extracting_contact_data",
                "Searching the store for contact information..."
            );

            contactPagesCrawled =
                await crawlContactPages(
                    context,
                    contactPageUrls,
                    normalizedStoreUrl,
                    deadline,
                    contactMap,
                    html,
                    finalUrl
                );

            await reportProgress(
                onProgress,
                34,
                "contact_data_extracted",
                "Contact information extracted successfully."
            );
        }


        const contactEmails =
            Array.from(
                contactMap.values()
            );

        const primaryEmail =
            getPrimaryEmail(
                contactEmails
            );

        console.log(
            `Emails discovered: ${contactEmails.length}`
        );

        if (
            contactEmails.length > 0
        ) {
            console.log(
                "Email addresses:"
            );

            for (
                const item
                of contactEmails
            ) {
                console.log(
                    ` - ${item.email} (${item.type})`
                );
            }

        } else {
            console.log(
                "No publicly exposed email addresses were discovered."
            );
        }


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
                35,
                "crawling_products",
                `Crawling ${productUrls.length} product page${productUrls.length > 1 ? "s" : ""}...`
            );

            const PRODUCT_START =
                35;

            const PRODUCT_END =
                44;

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
                            normalizedStoreUrl
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
                44,
                "crawling_products",
                "No additional product pages to crawl."
            );
        }


        /* =================================================
           NORMALIZE PRODUCT RESULTS
        ================================================= */

        await reportProgress(
            onProgress,
            45,
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
            50,
            "crawl_completed",
            "Store crawl completed successfully."
        );


        /* =================================================
           FINAL RESULT
        ================================================= */

        return {
            success: true,

            data: {
                /*
                 * Original requested input.
                 */
                requestedUrl:
                    storeUrl,

                /*
                 * Clean normalized URL.
                 */
                normalizedUrl:
                    normalizedStoreUrl,

                /*
                 * Detected platform.
                 */
                platform:
                    detectedPlatform,

                /*
                 * Actual final URL after
                 * navigation.
                 */
                finalUrl,

                title:
                    homepageData.title ||
                    null,

                storeName:
                    homepageData.storeName ||
                    null,


                /* =========================================
                   HOMEPAGE
                ========================================= */

                homepage:
                    homepageData,


                /* =========================================
                   CONTACT INFORMATION
                ========================================= */

                contact: {
                    emails:
                        contactEmails,

                    totalEmails:
                        contactEmails.length,

                    primaryEmail,

                    pagesCrawled:
                        contactPagesCrawled
                },


                /* =========================================
                   DISCOVERED PAGES
                ========================================= */

                discoveredPages: {
                    products:
                        productUrls,

                    contact:
                        contactPageUrls
                },


                /* =========================================
                   DISCOVERY INFORMATION
                ========================================= */

                discovery: {
                    productUrlsFromClassifier:
                        classifiedProductUrls,

                    productUrlsFromExtractor:
                        extractedProductUrls,

                    totalUniqueProductUrls:
                        discoveredProductUrls.length
                },


                /* =========================================
                   PRODUCTS
                ========================================= */

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


/* =========================================================
   EXPORT
========================================================= */

module.exports = {
    crawlHomepage
};