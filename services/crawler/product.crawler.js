const {
    extractPageData
} = require("./html.extractor");


/* =========================================================
   CONFIG
========================================================= */

const NAVIGATION_TIMEOUT = 30000;
const RETRY_NAVIGATION_TIMEOUT = 15000;

const DOM_CONTENT_LOADED_TIMEOUT = 8000;
const NETWORK_IDLE_TIMEOUT = 5000;

const SETTLE_DELAY = 700;
const RETRY_DELAY = 1000;

const MAX_HTML_SIZE = 5 * 1024 * 1024;
const MIN_USABLE_HTML_SIZE = 500;

const MAX_NAVIGATION_ATTEMPTS = 2;
const MAX_SHOPIFY_JSON_ATTEMPTS = 2;

const SHOPIFY_JSON_TIMEOUT = 15000;


/* =========================================================
   URL HELPERS
========================================================= */

const normalizeHostname = (hostname = "") => {
    return hostname
        .toLowerCase()
        .replace(/^www\./, "")
        .trim();
};


const isSameStore = (urlA, urlB) => {
    try {
        const a = new URL(urlA);
        const b = new URL(urlB);

        return (
            normalizeHostname(a.hostname) ===
            normalizeHostname(b.hostname)
        );

    } catch {
        return false;
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


const sleep = (ms) =>
    new Promise((resolve) =>
        setTimeout(resolve, ms)
    );


/* =========================================================
   ERROR CLASSIFICATION
========================================================= */

const classifyError = (error) => {

    const message =
        String(
            error?.message || ""
        ).toLowerCase();

    if (
        error?.name === "TimeoutError" ||
        message.includes("timeout") ||
        message.includes("timed out")
    ) {
        return "network_timeout";
    }

    if (
        message.includes("net::") ||
        message.includes("connection") ||
        message.includes("socket") ||
        message.includes("econn") ||
        message.includes("enotfound") ||
        message.includes("dns")
    ) {
        return "network_error";
    }

    if (
        message.includes("redirect")
    ) {
        return "redirect_error";
    }

    if (
        message.includes("external")
    ) {
        return "redirect_error";
    }

    if (
        message.includes("html")
    ) {
        return "html_unavailable";
    }

    if (
        message.includes("shopify") ||
        message.includes(".js")
    ) {
        return "shopify_json_unavailable";
    }

    return "browser_error";
};


/* =========================================================
   REQUEST PROTECTION
========================================================= */

const setupRequestProtection = async (
    page,
    storeUrl
) => {

    await page.route(
        "**/*",
        async (route) => {

            try {

                const request =
                    route.request();

                const type =
                    request.resourceType();

                const url =
                    request.url();


                if (!isHttpUrl(url)) {
                    await route.abort();
                    return;
                }


                /*
                 * Fonts and media are not required
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
                 * Prevent third-party top-level
                 * document navigation.
                 */

                if (
                    type === "document" &&
                    !isSameStore(
                        url,
                        storeUrl
                    )
                ) {

                    console.warn(
                        `Blocked external navigation: ${url}`
                    );

                    await route.abort();

                    return;
                }


                await route.continue();

            } catch {

                try {
                    await route.continue();
                } catch {}
            }
        }
    );


    page.on(
        "requestfailed",
        (request) => {

            const url =
                request.url();


            if (
                url.includes("/cdn/fonts/") ||
                url.includes("fonts.gstatic.com") ||
                url.includes("google-analytics") ||
                url.includes("analytics.google.com") ||
                url.includes("googletagmanager") ||
                url.includes("facebook") ||
                url.includes("doubleclick") ||
                url.includes("clarity") ||
                url.includes("shopifysvc.com") ||
                url.includes("merchant-center-analytics") ||
                url.includes("/api/collect") ||
                url.includes("monorail") ||
                url.includes("klaviyo.com")
            ) {
                return;
            }


            console.warn(
                `Request failed: ${url} - ${
                    request.failure()?.errorText ||
                    "unknown"
                }`
            );
        }
    );
};


/* =========================================================
   JSON-LD PRODUCT EXTRACTION
========================================================= */

const extractJsonLdProduct = (
    jsonLd
) => {

    if (!jsonLd) {
        return null;
    }


    if (Array.isArray(jsonLd)) {

        for (const item of jsonLd) {

            const result =
                extractJsonLdProduct(item);

            if (result) {
                return result;
            }
        }

        return null;
    }


    if (
        typeof jsonLd !==
        "object"
    ) {
        return null;
    }


    const type =
        jsonLd["@type"];


    if (
        type === "Product" ||
        (
            Array.isArray(type) &&
            type.includes("Product")
        )
    ) {

        return jsonLd;
    }


    if (jsonLd["@graph"]) {

        return extractJsonLdProduct(
            jsonLd["@graph"]
        );
    }


    return null;
};


/* =========================================================
   JSON-LD FROM PAGE
========================================================= */

const extractProductJsonLd =
    async (page) => {

        try {

            return await page.evaluate(
                () => {

                    const scripts =
                        Array.from(
                            document.querySelectorAll(
                                'script[type="application/ld+json"]'
                            )
                        );


                    return scripts
                        .map((script) => {

                            try {

                                return JSON.parse(
                                    script.textContent
                                );

                            } catch {

                                return null;
                            }
                        })
                        .filter(Boolean);
                }
            );

        } catch {

            return [];
        }
    };


/* =========================================================
   JSON-LD FROM RAW HTML
========================================================= */

const extractProductJsonLdFromHtml = (
    html = ""
) => {

    if (!html) {
        return [];
    }


    const matches = [
        ...html.matchAll(
            /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
        )
    ];


    const results = [];


    for (const match of matches) {

        const raw =
            match?.[1]?.trim();


        if (!raw) {
            continue;
        }


        try {

            results.push(
                JSON.parse(raw)
            );

        } catch {
            /*
             * Ignore malformed JSON-LD.
             */
        }
    }


    return results;
};


/* =========================================================
   SHOPIFY PRODUCT JSON — BROWSER
========================================================= */

const getShopifyProductData =
    async (page) => {

        for (
            let attempt = 1;
            attempt <= MAX_SHOPIFY_JSON_ATTEMPTS;
            attempt++
        ) {

            try {

                console.log(
                    `Shopify browser JSON attempt ${attempt}/${MAX_SHOPIFY_JSON_ATTEMPTS}`
                );


                const result =
                    await page.evaluate(
                        async () => {

                            try {

                                const pathname =
                                    window.location
                                        .pathname
                                        .replace(
                                            /\/$/,
                                            ""
                                        );


                                const productUrl =
                                    `${pathname}.js`;


                                const controller =
                                    new AbortController();


                                const timeout =
                                    setTimeout(
                                        () =>
                                            controller.abort(),
                                        12000
                                    );


                                try {

                                    const response =
                                        await fetch(
                                            productUrl,
                                            {
                                                credentials:
                                                    "same-origin",

                                                signal:
                                                    controller.signal
                                            }
                                        );


                                    if (
                                        !response.ok
                                    ) {

                                        return {
                                            success: false,
                                            status:
                                                response.status,
                                            reason:
                                                "http_error"
                                        };
                                    }


                                    const contentType =
                                        response.headers.get(
                                            "content-type"
                                        ) || "";


                                    if (
                                        !contentType.includes(
                                            "json"
                                        )
                                    ) {

                                        return {
                                            success: false,
                                            status:
                                                response.status,
                                            reason:
                                                "non_json_response"
                                        };
                                    }


                                    const data =
                                        await response.json();


                                    if (
                                        !data ||
                                        typeof data !==
                                            "object"
                                    ) {

                                        return {
                                            success: false,
                                            status:
                                                response.status,
                                            reason:
                                                "invalid_json"
                                        };
                                    }


                                    return {
                                        success: true,
                                        data
                                    };

                                } finally {

                                    clearTimeout(
                                        timeout
                                    );
                                }

                            } catch (error) {

                                return {
                                    success: false,
                                    reason:
                                        error?.name ===
                                        "AbortError"
                                            ? "timeout"
                                            : "network_error"
                                };
                            }
                        }
                    );


                if (
                    result?.success &&
                    result?.data
                ) {

                    console.log(
                        "Shopify browser JSON succeeded"
                    );

                    return result.data;
                }


                console.warn(
                    `Shopify browser JSON failed: ${
                        result?.reason ||
                        "unknown"
                    }${
                        result?.status
                            ? ` (HTTP ${result.status})`
                            : ""
                    }`
                );


                /*
                 * A 404 means the endpoint does not
                 * exist. Retrying it is pointless.
                 */

                if (
                    result?.status === 404
                ) {
                    return null;
                }

            } catch (error) {

                console.warn(
                    `Shopify browser JSON error: ${error.message}`
                );
            }


            if (
                attempt <
                MAX_SHOPIFY_JSON_ATTEMPTS
            ) {

                await sleep(
                    RETRY_DELAY
                );
            }
        }


        return null;
    };


/* =========================================================
   DIRECT SHOPIFY JSON FALLBACK
========================================================= */

const getShopifyProductDataDirect =
    async (
        context,
        productUrl
    ) => {

        let parsed;

        try {

            parsed =
                new URL(productUrl);

        } catch {

            return null;
        }


        const pathname =
            parsed.pathname
                .replace(
                    /\/$/,
                    ""
                );


        const jsonUrl =
            `${parsed.origin}${pathname}.js`;


        console.log(
            `Trying Shopify product JSON fallback: ${jsonUrl}`
        );


        for (
            let attempt = 1;
            attempt <= MAX_SHOPIFY_JSON_ATTEMPTS;
            attempt++
        ) {

            try {

                console.log(
                    `Shopify direct JSON attempt ${attempt}/${MAX_SHOPIFY_JSON_ATTEMPTS}`
                );


                const startedAt =
                    Date.now();


                const response =
                    await context.request.get(
                        jsonUrl,
                        {
                            timeout:
                                SHOPIFY_JSON_TIMEOUT,

                            failOnStatusCode:
                                false
                        }
                    );


                const elapsed =
                    Date.now() -
                    startedAt;


                const status =
                    response.status();


                const headers =
                    response.headers();


                const contentType =
                    headers[
                        "content-type"
                    ] || "";


                console.log(
                    `Shopify JSON response: HTTP ${status}, ${contentType}, ${elapsed}ms`
                );


                /*
                 * Product does not exist.
                 * Do not waste another request.
                 */

                if (
                    status === 404
                ) {

                    console.warn(
                        `Shopify JSON endpoint returned 404: ${jsonUrl}`
                    );

                    return null;
                }


                /*
                 * Rate limiting or temporary
                 * server failure can be retried.
                 */

                if (
                    status === 429 ||
                    status >= 500
                ) {

                    console.warn(
                        `Temporary Shopify JSON HTTP error ${status}`
                    );

                    if (
                        attempt <
                        MAX_SHOPIFY_JSON_ATTEMPTS
                    ) {

                        await sleep(
                            RETRY_DELAY
                        );

                        continue;
                    }

                    return null;
                }


                if (!response.ok()) {

                    console.warn(
                        `Shopify JSON fallback returned HTTP ${status}: ${productUrl}`
                    );

                    return null;
                }


                if (
                    !contentType.includes(
                        "json"
                    )
                ) {

                    console.warn(
                        `Shopify JSON fallback returned non-JSON content: ${productUrl}`
                    );

                    /*
                     * This is normally a theme,
                     * bot protection, redirect,
                     * or server response issue.
                     *
                     * Retry once because it can be
                     * transient.
                     */

                    if (
                        attempt <
                        MAX_SHOPIFY_JSON_ATTEMPTS
                    ) {

                        await sleep(
                            RETRY_DELAY
                        );

                        continue;
                    }

                    return null;
                }


                const data =
                    await response.json();


                if (
                    !data ||
                    typeof data !== "object"
                ) {

                    console.warn(
                        `Shopify JSON returned invalid data: ${productUrl}`
                    );

                    return null;
                }


                console.log(
                    `Shopify JSON fallback succeeded: ${productUrl}`
                );


                return data;

            } catch (error) {

                const reason =
                    classifyError(
                        error
                    );


                console.warn(
                    `Shopify JSON fallback failed [${reason}] attempt ${attempt}/${MAX_SHOPIFY_JSON_ATTEMPTS}: ${productUrl} - ${error.message}`
                );


                if (
                    attempt <
                    MAX_SHOPIFY_JSON_ATTEMPTS
                ) {

                    await sleep(
                        RETRY_DELAY
                    );
                }
            }
        }


        return null;
    };


/* =========================================================
   NORMALIZE SHOPIFY PRODUCT
========================================================= */

const normalizeShopifyProduct =
    (product) => {

        if (!product) {
            return null;
        }


        const variants =
            Array.isArray(
                product.variants
            )
                ? product.variants
                : [];


        /* -----------------------------------------------------
           PRICES
        ----------------------------------------------------- */

        const prices =
            variants
                .map((variant) =>
                    Number.parseFloat(
                        variant?.price
                    )
                )
                .filter(
                    Number.isFinite
                );


        const compareAtPrices =
            variants
                .map((variant) =>
                    Number.parseFloat(
                        variant?.compare_at_price
                    )
                )
                .filter(
                    Number.isFinite
                );


        /* -----------------------------------------------------
           AVAILABILITY
        ----------------------------------------------------- */

        const availableVariants =
            variants.filter(
                (variant) =>
                    variant?.available !== false
            );


        const lowestPrice =
            prices.length > 0
                ? Math.min(...prices)
                : null;


        const highestPrice =
            prices.length > 0
                ? Math.max(...prices)
                : null;


        const lowestCompareAtPrice =
            compareAtPrices.length > 0
                ? Math.min(...compareAtPrices)
                : null;


        const highestCompareAtPrice =
            compareAtPrices.length > 0
                ? Math.max(...compareAtPrices)
                : null;


        return {

            id:
                product.id ||
                null,

            title:
                product.title ||
                null,

            handle:
                product.handle ||
                null,

            vendor:
                product.vendor ||
                null,

            productType:
                product.product_type ||
                null,

            description:
                product.description ||
                null,

            descriptionLength:
                typeof product.description ===
                "string"
                    ? product.description
                        .replace(
                            /<[^>]*>/g,
                            " "
                        )
                        .replace(
                            /\s+/g,
                            " "
                        )
                        .trim()
                        .length
                    : 0,

            tags:
                Array.isArray(
                    product.tags
                )
                    ? product.tags
                    : [],

            images:
                Array.isArray(
                    product.images
                )
                    ? product.images
                    : [],

            imageCount:
                Array.isArray(
                    product.images
                )
                    ? product.images.length
                    : 0,


            variants:
                variants.map(
                    (variant) => ({

                        id:
                            variant?.id ||
                            null,

                        title:
                            variant?.title ||
                            null,

                        price:
                            variant?.price ||
                            null,

                        compareAtPrice:
                            variant?.compare_at_price ||
                            null,

                        available:
                            variant?.available !==
                            false
                    })
                ),


            variantCount:
                variants.length,

            availableVariantCount:
                availableVariants.length,


            pricing: {

                lowest:
                    lowestPrice,

                highest:
                    highestPrice,

                lowestCompareAt:
                    lowestCompareAtPrice,

                highestCompareAt:
                    highestCompareAtPrice,

                currency:
                    product.currency ||
                    null
            },


            availability: {

                totalVariants:
                    variants.length,

                availableVariants:
                    availableVariants.length,

                unavailableVariants:
                    Math.max(
                        variants.length -
                        availableVariants.length,
                        0
                    )
            },


            minPrice:
                lowestPrice,

            maxPrice:
                highestPrice,

            available:
                variants.length > 0
                    ? availableVariants.length >
                      0
                    : null
        };
    };


/* =========================================================
   PRODUCT DOM DATA
========================================================= */

const extractProductDomData =
    async (page) => {

        try {

            return await page.evaluate(
                () => {

                    const cleanText =
                        (value) =>
                            String(
                                value || ""
                            )
                                .replace(
                                    /\s+/g,
                                    " "
                                )
                                .trim();


                    const images =
                        Array.from(
                            document.images
                        );


                    const imageData =
                        images.map(
                            (img) => ({

                                src:
                                    img.currentSrc ||
                                    img.src ||
                                    null,

                                alt:
                                    cleanText(
                                        img.getAttribute(
                                            "alt"
                                        )
                                    ) ||
                                    null
                            })
                        );


                    const buttons =
                        Array.from(
                            document.querySelectorAll(
                                "button, input[type='submit'], input[type='button'], a"
                            )
                        );


                    const buttonTexts =
                        buttons
                            .map(
                                (button) =>
                                    cleanText(
                                        button.innerText ||
                                        button.value ||
                                        button.getAttribute(
                                            "aria-label"
                                        ) ||
                                        button.getAttribute(
                                            "title"
                                        )
                                    )
                            )
                            .filter(Boolean);


                    const bodyText =
                        cleanText(
                            document.body
                                ?.innerText ||
                            ""
                        );


                    const hasAddToCart =
                        buttonTexts.some(
                            (text) =>
                                /add\s*to\s*cart|add\s*to\s*bag|buy\s*now|purchase|shop\s*now/i
                                    .test(
                                        text
                                    )
                        ) ||
                        Boolean(
                            document.querySelector(
                                'form[action*="/cart/add"], button[name="add"], [data-add-to-cart], .product-form__submit, .shopify-payment-button'
                            )
                        );


                    const hasReviews =
                        /reviews?|ratings?|customer reviews?/i
                            .test(
                                bodyText
                            );


                    const hasShipping =
                        /shipping|delivery/i
                            .test(
                                bodyText
                            );


                    const hasReturns =
                        /returns?|refund/i
                            .test(
                                bodyText
                            );


                    const priceElements =
                        Array.from(
                            document.querySelectorAll(
                                [
                                    '[class*="price"]',
                                    '[data-price]',
                                    '[data-product-price]',
                                    '[itemprop="price"]',
                                    '.money'
                                ].join(", ")
                            )
                        );


                    const prices =
                        priceElements
                            .map(
                                (element) =>
                                    cleanText(
                                        element.innerText ||
                                        element.textContent ||
                                        element.getAttribute(
                                            "content"
                                        )
                                    )
                            )
                            .filter(Boolean)
                            .slice(
                                0,
                                30
                            );


                    return {

                        images:
                            imageData,

                        buttons:
                            buttonTexts.slice(
                                0,
                                100
                            ),

                        conversion: {

                            hasAddToCart,

                            hasReviews,

                            hasShipping,

                            hasReturns
                        },

                        prices,

                        bodyTextLength:
                            bodyText.length
                    };
                }
            );

        } catch {

            return {

                images: [],

                buttons: [],

                conversion: {

                    hasAddToCart: false,

                    hasReviews: false,

                    hasShipping: false,

                    hasReturns: false
                },

                prices: [],

                bodyTextLength: 0
            };
        }
    };


/* =========================================================
   SAFE PRODUCT NAVIGATION
========================================================= */

const navigateProductSafely =
    async (
        page,
        productUrl,
        storeUrl
    ) => {

        if (!isHttpUrl(productUrl)) {

            throw new Error(
                `Unsupported product URL: ${productUrl}`
            );
        }


        if (
            !isSameStore(
                productUrl,
                storeUrl
            )
        ) {

            throw new Error(
                `Blocked external product URL: ${productUrl}`
            );
        }


        page.setDefaultNavigationTimeout(
            NAVIGATION_TIMEOUT
        );

        page.setDefaultTimeout(
            NAVIGATION_TIMEOUT
        );


        let navigationTimedOut =
            false;

        let navigationAttempts =
            0;

        let lastNavigationError =
            null;


        console.log(
            `Opening product: ${productUrl}`
        );


        /* =====================================================
           NAVIGATION WITH CONTROLLED RETRY
        ===================================================== */

        for (
            let attempt = 1;
            attempt <= MAX_NAVIGATION_ATTEMPTS;
            attempt++
        ) {

            navigationAttempts =
                attempt;


            const timeout =
                attempt === 1
                    ? NAVIGATION_TIMEOUT
                    : RETRY_NAVIGATION_TIMEOUT;


            console.log(
                `Product navigation attempt ${attempt}/${MAX_NAVIGATION_ATTEMPTS}: ${productUrl}`
            );


            try {

                await page.goto(
                    productUrl,
                    {
                        waitUntil:
                            "commit",

                        timeout
                    }
                );


                lastNavigationError =
                    null;

                break;

            } catch (error) {

                lastNavigationError =
                    error;


                const reason =
                    classifyError(
                        error
                    );


                const currentUrl =
                    page.url();


                console.warn(
                    `Product navigation failed [${reason}] attempt ${attempt}/${MAX_NAVIGATION_ATTEMPTS}: ${productUrl}`
                );


                /*
                 * A non-timeout browser error should not
                 * be retried blindly.
                 */

                if (
                    reason !==
                        "network_timeout" &&
                    reason !==
                        "network_error"
                ) {

                    throw error;
                }


                navigationTimedOut =
                    true;


                /*
                 * If Playwright committed the page despite
                 * the timeout, we may still be able to use it.
                 */

                if (
                    currentUrl &&
                    currentUrl !==
                        "about:blank"
                ) {

                    break;
                }


                if (
                    attempt <
                    MAX_NAVIGATION_ATTEMPTS
                ) {

                    await sleep(
                        RETRY_DELAY
                    );
                }
            }
        }


        await sleep(
            SETTLE_DELAY
        );


        let currentUrl =
            page.url();


        /* =====================================================
           FINAL NAVIGATION VALIDATION
        ===================================================== */

        if (
            !currentUrl ||
            currentUrl ===
                "about:blank"
        ) {

            throw new Error(
                `Product page never committed after ${navigationAttempts} attempt(s): ${productUrl}`
            );
        }


        if (
            !isSameStore(
                currentUrl,
                storeUrl
            )
        ) {

            throw new Error(
                `Product redirected outside store: ${currentUrl}`
            );
        }


        /* =====================================================
           DOM CONTENT LOADED
        ===================================================== */

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
                `Product DOMContentLoaded timeout: ${productUrl}`
            );
        }


        /* =====================================================
           NETWORK IDLE
        ===================================================== */

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
                `Product network idle timeout: ${productUrl}`
            );
        }


        await sleep(
            SETTLE_DELAY
        );


        currentUrl =
            page.url();


        if (
            !isSameStore(
                currentUrl,
                storeUrl
            )
        ) {

            throw new Error(
                `Product redirected outside store: ${currentUrl}`
            );
        }


        /* =====================================================
           GET HTML
        ===================================================== */

        let html = "";


        try {

            html =
                await page.content();

        } catch (error) {

            throw new Error(
                `Unable to read product HTML: ${error.message}`
            );
        }


        const htmlBytes =
            Buffer.byteLength(
                html || "",
                "utf8"
            );


        console.log(
            `Product HTML loaded: ${
                Math.round(
                    htmlBytes / 1024
                )
            } KB`
        );


        if (
            htmlBytes >
            MAX_HTML_SIZE
        ) {

            throw new Error(
                `Product HTML exceeds ${MAX_HTML_SIZE} bytes`
            );
        }


        const htmlUsable =
            Boolean(
                html &&
                htmlBytes >=
                    MIN_USABLE_HTML_SIZE
            );


        /*
         * If navigation timed out but produced usable HTML,
         * this is still a valid crawl. We keep the timeout
         * as diagnostic information rather than treating
         * the crawl as failed.
         */

        if (
            navigationTimedOut &&
            htmlUsable
        ) {

            console.warn(
                `Product navigation timed out but usable HTML was recovered: ${productUrl}`
            );
        }


        return {

            finalUrl:
                currentUrl,

            navigationTimedOut,

            navigationAttempts,

            lastNavigationError:
                lastNavigationError
                    ? lastNavigationError.message
                    : null,

            html,

            htmlUsable
        };
    };


/* =========================================================
   CRAWL PRODUCT PAGE
========================================================= */

const crawlProductPage = async (
    productUrl,
    context,
    storeUrl = productUrl
) => {

    let page;


    try {

        console.log(
            `Crawling product: ${productUrl}`
        );


        page =
            await context.newPage();


        await setupRequestProtection(
            page,
            storeUrl
        );


        const navigation =
            await navigateProductSafely(
                page,
                productUrl,
                storeUrl
            );


        const html =
            navigation.html;


        const htmlUsable =
            navigation.htmlUsable;


        /* =====================================================
           SHOPIFY PRODUCT DATA
        ===================================================== */

        let shopifyProduct =
            null;


        let shopifyDataSource =
            null;


        if (htmlUsable) {

            shopifyProduct =
                await getShopifyProductData(
                    page
                );


            if (shopifyProduct) {

                shopifyDataSource =
                    "browser";
            }
        }


        /*
         * If browser fetch failed, use the direct
         * Playwright request context.
         */

        if (!shopifyProduct) {

            shopifyProduct =
                await getShopifyProductDataDirect(
                    context,
                    navigation.finalUrl
                );


            if (shopifyProduct) {

                shopifyDataSource =
                    "direct";
            }
        }


        const normalizedShopify =
            normalizeShopifyProduct(
                shopifyProduct
            );


        /* =====================================================
           HTML EXTRACTION
        ===================================================== */

        let pageData = null;


        let domData = {

            images: [],

            buttons: [],

            conversion: {

                hasAddToCart: false,

                hasReviews: false,

                hasShipping: false,

                hasReturns: false
            },

            prices: [],

            bodyTextLength: 0
        };


        let jsonLd = [];


        let structuredProduct = null;


        if (htmlUsable) {

            pageData =
                extractPageData(
                    html,
                    navigation.finalUrl
                );


            domData =
                await extractProductDomData(
                    page
                );


            /*
             * First try rendered DOM.
             */

            jsonLd =
                await extractProductJsonLd(
                    page
                );


            structuredProduct =
                extractJsonLdProduct(
                    jsonLd
                );


            /*
             * If rendered DOM didn't expose Product
             * JSON-LD, inspect raw HTML.
             */

            if (!structuredProduct) {

                const rawHtmlJsonLd =
                    extractProductJsonLdFromHtml(
                        html
                    );


                structuredProduct =
                    extractJsonLdProduct(
                        rawHtmlJsonLd
                    );


                if (
                    structuredProduct
                ) {

                    jsonLd =
                        rawHtmlJsonLd;
                }
            }
        }


        /* =====================================================
           PRODUCT VALIDATION
        ===================================================== */

        const hasProductData =
            Boolean(
                normalizedShopify
            );


        /*
         * A product is considered successfully crawled
         * when we have either usable HTML or Shopify
         * product JSON.
         */

        if (
            !htmlUsable &&
            !hasProductData
        ) {

            const failure =
                new Error(
                    `Product page returned unusable HTML and Shopify product data was unavailable: ${productUrl}`
                );


            failure.failureReason =
                navigation.navigationTimedOut
                    ? "network_timeout"
                    : "html_unavailable";


            throw failure;
        }


        /* =====================================================
           IMAGE ALT ANALYSIS
        ===================================================== */

        const imagesWithoutAlt =
            domData.images.filter(
                (image) =>
                    !image.alt ||
                    image.alt.trim()
                        .length === 0
            ).length;


        /* =====================================================
           CONVERSION SIGNALS
        ===================================================== */

        let conversion =
            domData.conversion;


        if (!htmlUsable) {

            conversion = {

                hasAddToCart: false,

                hasReviews: false,

                hasShipping: false,

                hasReturns: false
            };
        }


        /*
         * Canonical conversion names.
         *
         * Keep old aliases for compatibility.
         */

        const hasShippingInfo =
            conversion.hasShipping === true ||
            conversion.hasShippingInfo === true;


        const hasReturnInfo =
            conversion.hasReturns === true ||
            conversion.hasReturnInfo === true;


        /* =====================================================
           PURCHASE SIGNALS
        ===================================================== */

        let hasProductForm =
            false;


        let hasBuyNow =
            false;


        if (htmlUsable) {

            try {

                hasProductForm =
                    Boolean(
                        await page
                            .locator(
                                'form[action*="/cart/add"], form[action*="/cart/add.js"], form[action*="cart/add"]'
                            )
                            .count()
                    );

            } catch {
                hasProductForm = false;
            }


            try {

                hasBuyNow =
                    Boolean(
                        await page
                            .locator(
                                '[data-buy-now], .shopify-payment-button, .shopify-payment-button__button, [name="checkout"]'
                            )
                            .count()
                    );

            } catch {
                hasBuyNow = false;
            }
        }


        const hasAddToCart =
            conversion.hasAddToCart === true ||
            hasProductForm;


        const purchaseCtaCount =
            Number(
                hasAddToCart
            ) +
            Number(
                hasProductForm
            ) +
            Number(
                hasBuyNow
            );


        /* =====================================================
           CRAWL METHOD
        ===================================================== */

        let crawlMethod =
            "html-only";


        if (
            htmlUsable &&
            shopifyDataSource ===
                "browser"
        ) {

            crawlMethod =
                "html+shopify-json-browser";

        } else if (
            htmlUsable &&
            shopifyDataSource ===
                "direct"
        ) {

            crawlMethod =
                "html+shopify-json-direct";

        } else if (
            !htmlUsable &&
            shopifyDataSource
        ) {

            crawlMethod =
                "shopify-json-only";
        }


        /* =====================================================
           FINAL RESULT
        ===================================================== */

        const result = {

            /*
             * IMPORTANT:
             * success + crawlStatus explicitly define
             * whether this product can enter the audit.
             */

            success: true,

            crawlStatus:
                "completed",

            failureReason:
                null,


            url:
                navigation.finalUrl,

            requestedUrl:
                productUrl,

            finalUrl:
                navigation.finalUrl,

            title:
                normalizedShopify?.title ||
                pageData?.product?.title ||
                structuredProduct?.name ||
                null,


            description: {
                text:
                    normalizedShopify?.description ||
                    pageData?.product?.description ||
                    null,

                length:
                    normalizedShopify?.descriptionLength ||
                    pageData?.product?.descriptionLength ||
                    0
            },


            shopify:
                normalizedShopify,


            html: {

                available:
                    htmlUsable,

                size:
                    Buffer.byteLength(
                        html || "",
                        "utf8"
                    )
            },


            images: {

                total:
                    domData.images.length,

                withoutAlt:
                    imagesWithoutAlt,

                items:
                    domData.images
            },


            conversion: {

                ...conversion,

                hasAddToCart,

                hasProductForm,

                hasBuyNow,

                purchaseCtaCount,


                /*
                 * Canonical names.
                 */

                hasShippingInfo,

                hasReturnInfo,


                /*
                 * Backward-compatible names.
                 */

                hasShipping:
                    hasShippingInfo,

                hasReturns:
                    hasReturnInfo
            },


            signals: {

                hasAddToCart,

                hasProductForm,

                hasBuyNow,

                purchaseCtaCount
            },


            prices:
                domData.prices,


            structuredData: {

                hasProductSchema:
                    Boolean(
                        structuredProduct
                    ),

                product:
                    structuredProduct,

                count:
                    jsonLd.length
            },


            navigationTimedOut:
                navigation.navigationTimedOut,


            navigationAttempts:
                navigation.navigationAttempts,


            shopifyDataSource,


            crawlMethod
        };


        console.log(
            "Product crawl completed:",
            JSON.stringify(
                {
                    url:
                        result.url,

                    crawlStatus:
                        result.crawlStatus,

                    title:
                        result.title,

                    pricing:
                        result.shopify?.pricing,

                    availability:
                        result.shopify?.availability,

                    signals:
                        result.signals,

                    hasProductSchema:
                        result.structuredData
                            ?.hasProductSchema,

                    navigationAttempts:
                        result.navigationAttempts,

                    navigationTimedOut:
                        result.navigationTimedOut,

                    shopifyDataSource:
                        result.shopifyDataSource,

                    crawlMethod:
                        result.crawlMethod
                },
                null,
                2
            )
        );


        return result;

    } catch (error) {

        const failureReason =
            error?.failureReason ||
            classifyError(error);


        console.warn(
            `Product crawler failed [${failureReason}]: ${productUrl} - ${error.message}`
        );


        return {

            success: false,

            crawlStatus:
                "failed",

            failureReason,

            url:
                productUrl,

            requestedUrl:
                productUrl,

            finalUrl:
                page
                    ? page.url() !==
                      "about:blank"
                        ? page.url()
                        : null
                    : null,

            title:
                null,

            error:
                error.message
        };

    } finally {

        if (page) {

            try {
                await page.close();
            } catch {}
        }
    }
};


module.exports = {
    crawlProductPage
};