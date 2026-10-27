
const cheerio = require("cheerio");

/* =========================================================
   TEXT HELPERS
========================================================= */

const cleanText = (value = "") =>
    String(value || "")
        .replace(/\s+/g, " ")
        .trim();

const parseJson = (value) => {
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
};

const normalizeHostname = (hostname = "") =>
    hostname
        .replace(/^www\./i, "")
        .toLowerCase()
        .trim();

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

const normalizeUrl = (url, baseUrl) => {
    try {
        const parsed = new URL(url, baseUrl);

        if (
            parsed.protocol !== "http:" &&
            parsed.protocol !== "https:"
        ) {
            return null;
        }

        parsed.hash = "";

        return parsed.toString().replace(/\/$/, "");
    } catch {
        return null;
    }
};

const isSameDomain = (url, baseUrl) => {
    try {
        const candidate = new URL(url);
        const base = new URL(baseUrl);

        return (
            normalizeHostname(candidate.hostname) ===
            normalizeHostname(base.hostname)
        );
    } catch {
        return false;
    }
};


/* =========================================================
   PLATFORM AND URL DETECTION
========================================================= */

const isEtsyHost = (hostname = "") => {
    return (
        normalizeHostname(hostname) === "etsy.com"
    );
};

const isEtsyShopUrl = (url) => {
    try {
        const parsed = new URL(url);

        return (
            isEtsyHost(parsed.hostname) &&
            /^\/shop\/[^/]+\/?$/i.test(parsed.pathname)
        );
    } catch {
        return false;
    }
};

const isEtsyListingUrl = (url) => {
    try {
        const parsed = new URL(url);

        return (
            isEtsyHost(parsed.hostname) &&
            /^\/listing\/\d+(?:\/|$)/i.test(
                parsed.pathname
            )
        );
    } catch {
        return false;
    }
};

const isProductPath = (pathname = "") => {
    const segments = pathname
        .split("/")
        .filter(Boolean);

    /*
     * Supports:
     * /products/example
     * /en/products/example
     * /de/products/example
     */
    const productIndex = segments.findIndex(
        (segment) =>
            segment.toLowerCase() === "products"
    );

    return (
        productIndex !== -1 &&
        Boolean(segments[productIndex + 1])
    );
};

const isGiftCardUrl = (url) => {
    try {
        const parsed = new URL(url);
        const pathname = parsed.pathname.toLowerCase();

        return (
            /\/products\/gift-?card(?:\/|$)/i.test(pathname) ||
            /\/products\/[^/]*gift-?card[^/]*(?:\/|$)/i.test(pathname)
        );
    } catch {
        return false;
    }
};

const isProductUrlForPlatform = (url, platform) => {
    try {
        const parsed = new URL(url);

        if (platform === "etsy") {
            return isEtsyListingUrl(url);
        }

        return (
            isProductPath(parsed.pathname) &&
            !isGiftCardUrl(url)
        );
    } catch {
        return false;
    }
};

const detectPlatform = (pageUrl, html = "") => {
    try {
        const hostname = new URL(pageUrl).hostname;

        /*
         * Etsy must be detected explicitly.
         * Etsy listings and shops use the shared
         * etsy.com domain.
         */
        if (isEtsyHost(hostname)) {
            return "etsy";
        }

        if (
            normalizeHostname(hostname).endsWith(
                ".myshopify.com"
            )
        ) {
            return "shopify";
        }

        const lowerHtml = String(html || "").toLowerCase();

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

        const matchedSignals = shopifySignals.filter(
            (signal) => lowerHtml.includes(signal)
        );

        return matchedSignals.length >= 2
            ? "shopify"
            : "unknown";
    } catch {
        return "unknown";
    }
};


/* =========================================================
   JSON-LD HELPERS
========================================================= */

const getJsonLdObjects = (value, output = []) => {
    if (!value) {
        return output;
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            getJsonLdObjects(item, output);
        }

        return output;
    }

    if (typeof value !== "object") {
        return output;
    }

    output.push(value);

    if (value["@graph"]) {
        getJsonLdObjects(value["@graph"], output);
    }

    if (value.mainEntity) {
        getJsonLdObjects(value.mainEntity, output);
    }

    if (value.itemListElement) {
        getJsonLdObjects(value.itemListElement, output);
    }

    return output;
};

const getSchemaTypes = (schema) => {
    if (!schema || typeof schema !== "object") {
        return [];
    }

    const value = schema["@type"];

    if (Array.isArray(value)) {
        return value.map((item) =>
            String(item).toLowerCase()
        );
    }

    return value
        ? [String(value).toLowerCase()]
        : [];
};

const isProductSchema = (schema) =>
    getSchemaTypes(schema).includes("product");

const extractProductSchema = (schemas = []) =>
    schemas.find(isProductSchema) || null;

const extractOrganizationSchema = (schemas = []) =>
    schemas.find((schema) => {
        const types = getSchemaTypes(schema);

        return (
            types.includes("organization") ||
            types.includes("store") ||
            types.includes("localbusiness")
        );
    }) || null;

const extractSchemaPrice = (productSchema) => {
    if (!productSchema) {
        return null;
    }

    const offers = Array.isArray(productSchema.offers)
        ? productSchema.offers
        : productSchema.offers
            ? [productSchema.offers]
            : [];

    const prices = offers
        .map((offer) => {
            const price =
                offer?.price ??
                offer?.lowPrice ??
                offer?.highPrice ??
                offer?.priceSpecification?.price;

            const numeric = Number(price);

            return Number.isFinite(numeric)
                ? numeric
                : null;
        })
        .filter((price) => price !== null);

    if (!prices.length) {
        return null;
    }

    return {
        lowest: Math.min(...prices),
        highest: Math.max(...prices),
        currency:
            offers.find((offer) => offer?.priceCurrency)
                ?.priceCurrency || null
    };
};

const getSchemaImageUrls = (image) => {
    if (!image) {
        return [];
    }

    const items = Array.isArray(image) ? image : [image];

    return items
        .map((item) => {
            if (typeof item === "string") {
                return item;
            }

            return item?.url || item?.contentUrl || null;
        })
        .filter(Boolean);
};


/* =========================================================
   PRODUCT URL DISCOVERY
========================================================= */

const discoverProductUrls = (
    $,
    pageUrl,
    platform,
    schemas = []
) => {
    const found = [];
    const seen = new Set();

    const addProductUrl = (rawUrl, source) => {
        if (!rawUrl) {
            return;
        }

        const normalized = normalizeUrl(rawUrl, pageUrl);

        if (!normalized || !isHttpUrl(normalized)) {
            return;
        }

        if (!isSameDomain(normalized, pageUrl)) {
            return;
        }

        if (
            !isProductUrlForPlatform(
                normalized,
                platform
            )
        ) {
            return;
        }

        /*
         * Remove tracking/query parameters from discovered
         * product URLs while preserving the path.
         */
        let cleanUrl = normalized;

        try {
            const parsed = new URL(normalized);
            parsed.search = "";
            parsed.hash = "";

            cleanUrl = parsed.toString().replace(/\/$/, "");
        } catch {
            return;
        }

        if (seen.has(cleanUrl)) {
            return;
        }

        seen.add(cleanUrl);

        found.push({
            url: cleanUrl,
            source
        });
    };

    /*
     * Links from the rendered page.
     */
    $("a[href]").each((_, element) => {
        const href = $(element).attr("href");

        addProductUrl(href, "link");
    });

    /*
     * Canonical URL may point to a product listing.
     */
    const canonical = $('link[rel="canonical"]').attr("href");

    if (canonical) {
        addProductUrl(canonical, "canonical");
    }

    /*
     * Product URLs declared in JSON-LD.
     */
    for (const schema of schemas) {
        if (isProductSchema(schema)) {
            addProductUrl(schema.url, "jsonld");

            if (schema["@id"]) {
                addProductUrl(schema["@id"], "jsonld");
            }

            if (schema.mainEntityOfPage) {
                const mainEntity = schema.mainEntityOfPage;

                addProductUrl(
                    typeof mainEntity === "string"
                        ? mainEntity
                        : mainEntity?.["@id"] || mainEntity?.url,
                    "jsonld"
                );
            }
        }

        if (
            String(schema["@type"] || "").toLowerCase() ===
            "itemlist"
        ) {
            const items = schema.itemListElement || [];

            for (const item of items) {
                const itemUrl =
                    item?.url ||
                    item?.item?.url ||
                    item?.item?.["@id"];

                addProductUrl(itemUrl, "jsonld");
            }
        }
    }

    return {
        total: found.length,
        urls: found
    };
};


/* =========================================================
   PRICE EXTRACTION
========================================================= */

const parsePrice = (value) => {
    if (value === null || value === undefined) {
        return null;
    }

    const cleaned = String(value)
        .replace(/,/g, "")
        .replace(/[^\d.-]/g, "");

    if (!cleaned) {
        return null;
    }

    const numeric = Number(cleaned);

    return Number.isFinite(numeric)
        ? numeric
        : null;
};

const extractPriceFromText = (text = "") => {
    const match = String(text).match(
        /(?:[$£€₦]\s?\d[\d,]*(?:\.\d{1,2})?|\d[\d,]*(?:\.\d{1,2})?\s?(?:USD|GBP|EUR|NGN|CAD|AUD))/i
    );

    return match ? match[0] : null;
};


/* =========================================================
   MAIN EXTRACTOR
========================================================= */

const extractPageData = (html, pageUrl) => {
    const $ = cheerio.load(html || "");

    /* -----------------------------------------------
       BASIC METADATA
    ------------------------------------------------ */

    const title = cleanText(
        $("title").first().text()
    ) || null;

    const metaDescription = cleanText(
        $('meta[name="description"]').attr("content") ||
        $('meta[property="og:description"]').attr("content") ||
        ""
    ) || null;

    const canonicalUrl = normalizeUrl(
        $('link[rel="canonical"]').attr("href") || "",
        pageUrl
    );

    const robots = cleanText(
        $('meta[name="robots"]').attr("content") || ""
    ) || null;

    const ogTitle = cleanText(
        $('meta[property="og:title"]').attr("content") || ""
    ) || null;

    const ogDescription = cleanText(
        $('meta[property="og:description"]').attr("content") || ""
    ) || null;

    const ogImage = normalizeUrl(
        $('meta[property="og:image"]').attr("content") || "",
        pageUrl
    );

    const ogSiteName = cleanText(
        $('meta[property="og:site_name"]').attr("content") || ""
    ) || null;

    const htmlLanguage =
        $("html").attr("lang") || null;

    const platform = detectPlatform(
        pageUrl,
        html || ""
    );

    const parsedPageUrl = (() => {
        try {
            return new URL(pageUrl);
        } catch {
            return null;
        }
    })();

    /* -----------------------------------------------
       JSON-LD
    ------------------------------------------------ */

    const structuredDataItems = [];

    $('script[type="application/ld+json"]').each((_, element) => {
        const raw = $(element).contents().text().trim();

        const parsed = parseJson(raw);

        if (parsed) {
            structuredDataItems.push(parsed);
        }
    });

    const structuredData = structuredDataItems.flatMap(
        (item) => getJsonLdObjects(item, [])
    );

    const productSchema = extractProductSchema(
        structuredData
    );

    const organizationSchema =
        extractOrganizationSchema(structuredData);

    /* -----------------------------------------------
       STORE NAME
    ------------------------------------------------ */

    let storeName =
        ogSiteName ||
        organizationSchema?.name ||
        null;

    if (!storeName && platform === "etsy" && parsedPageUrl) {
        const shopMatch = parsedPageUrl.pathname.match(
            /^\/shop\/([^/]+)/i
        );

        if (shopMatch) {
            storeName = decodeURIComponent(shopMatch[1])
                .replace(/[-_]+/g, " ");
        }
    }

    if (!storeName && title) {
        storeName = cleanText(
            title.split(/\s+[|–—-]\s+/)[0]
        ) || null;
    }

    /* -----------------------------------------------
       HEADINGS
    ------------------------------------------------ */

    const headings = {
        h1: [],
        h2: [],
        h3: []
    };

    for (const tag of ["h1", "h2", "h3"]) {
        $(tag).each((_, element) => {
            const text = cleanText($(element).text());

            if (text) {
                headings[tag].push(text);
            }
        });
    }

    /* -----------------------------------------------
       IMAGES
    ------------------------------------------------ */

    const images = [];

    $("img").each((_, element) => {
        const $image = $(element);

        const src =
            $image.attr("src") ||
            $image.attr("data-src") ||
            $image.attr("data-lazy-src") ||
            $image.attr("data-original") ||
            null;

        const normalizedSrc = src
            ? normalizeUrl(src, pageUrl)
            : null;

        if (!normalizedSrc) {
            return;
        }

        images.push({
            src: normalizedSrc,
            alt: cleanText($image.attr("alt") || ""),
            width: $image.attr("width") || null,
            height: $image.attr("height") || null
        });
    });

    const uniqueImages = [];
    const seenImages = new Set();

    for (const image of images) {
        if (seenImages.has(image.src)) {
            continue;
        }

        seenImages.add(image.src);
        uniqueImages.push(image);
    }

    /* -----------------------------------------------
       LINKS
    ------------------------------------------------ */

    const links = [];

    $("a[href]").each((_, element) => {
        const $link = $(element);

        const rawHref = $link.attr("href");

        const href = normalizeUrl(rawHref, pageUrl);

        if (!href) {
            return;
        }

        links.push({
            href,
            text: cleanText($link.text()),
            label: cleanText(
                $link.attr("aria-label") || ""
            ),
            title: cleanText(
                $link.attr("title") || ""
            )
        });
    });

    /* -----------------------------------------------
       FORMS
    ------------------------------------------------ */

    const forms = [];

    $("form").each((_, element) => {
        const $form = $(element);

        forms.push({
            action: normalizeUrl(
                $form.attr("action") || pageUrl,
                pageUrl
            ),
            method: (
                $form.attr("method") || "GET"
            ).toUpperCase(),
            inputs: $form.find("input").map((__, input) => ({
                name: $(input).attr("name") || null,
                type: $(input).attr("type") || "text",
                required: $(input).is("[required]")
            })).get()
        });
    });

    /* -----------------------------------------------
       BUTTONS
    ------------------------------------------------ */

    const buttons = [];

    $("button, input[type='submit'], [role='button']").each(
        (_, element) => {
            const $button = $(element);

            buttons.push({
                text: cleanText(
                    $button.text() ||
                    $button.attr("value") ||
                    $button.attr("aria-label") ||
                    ""
                ),
                type: $button.attr("type") || null,
                name: $button.attr("name") || null,
                id: $button.attr("id") || null,
                className: $button.attr("class") || null
            });
        }
    );

    /* -----------------------------------------------
       PRODUCT DISCOVERY
    ------------------------------------------------ */

    const productDiscovery = discoverProductUrls(
        $,
        pageUrl,
        platform,
        structuredData
    );

    /* -----------------------------------------------
       PRODUCT DATA
    ------------------------------------------------ */

    const schemaPrice = extractSchemaPrice(productSchema);

    const schemaImages = getSchemaImageUrls(
        productSchema?.image
    ).map((src) => normalizeUrl(src, pageUrl))
        .filter(Boolean);

    const schemaOffers = Array.isArray(productSchema?.offers)
        ? productSchema.offers
        : productSchema?.offers
            ? [productSchema.offers]
            : [];

    const schemaAvailability = schemaOffers
        .map((offer) => offer?.availability)
        .find(Boolean) || null;

    const schemaReviews =
        productSchema?.aggregateRating || null;

    /*
     * Etsy's listing pages commonly expose product
     * details through metadata, JSON-LD, and visible HTML.
     * Availability of each field depends on the page.
     */

    const productTitle =
        cleanText(
            productSchema?.name ||
            $('meta[property="og:title"]').attr("content") ||
            $('meta[name="twitter:title"]').attr("content") ||
            $("h1").first().text() ||
            ""
        ) || null;

    const productDescription =
        cleanText(
            productSchema?.description ||
            $('meta[property="og:description"]').attr("content") ||
            $('meta[name="description"]').attr("content") ||
            ""
        ) || null;

    const metaPrice =
        $('meta[property="product:price:amount"]').attr("content") ||
        $('meta[property="og:price:amount"]').attr("content") ||
        $('[itemprop="price"]').attr("content") ||
        null;

    const visiblePriceText =
        extractPriceFromText(
            $('[itemprop="price"]').first().text() ||
            $('[data-buy-box-region]').first().text() ||
            $("body").text().slice(0, 12000)
        );

    const priceValue =
        schemaPrice?.lowest ??
        parsePrice(metaPrice) ??
        parsePrice(visiblePriceText);

    const priceCurrency =
        schemaPrice?.currency ||
        $('meta[property="product:price:currency"]').attr("content") ||
        $('meta[property="og:price:currency"]').attr("content") ||
        null;

    const productImages = [
        ...schemaImages,
        ...uniqueImages.map((image) => image.src),
        ...(ogImage ? [ogImage] : [])
    ].filter(Boolean);

    const uniqueProductImages = [
        ...new Set(productImages)
    ];

    const availabilityText = cleanText(
        schemaAvailability || ""
    );

    const visibleBodyText = cleanText(
        $("body").text()
    );

    const bodyLower = visibleBodyText.toLowerCase();

    const availability =
        /outofstock|soldout|sold out|currently unavailable/i.test(
            availabilityText + " " + bodyLower.slice(0, 10000)
        )
            ? "unavailable"
            : /instock|in stock|available/i.test(
                availabilityText
            )
                ? "available"
                : null;

    const reviewCount = Number(
        schemaReviews?.reviewCount ??
        schemaReviews?.ratingCount ??
        0
    ) || null;

    const ratingValue = Number(
        schemaReviews?.ratingValue ?? 0
    ) || null;

    const product = {
        title: productTitle,
        description: productDescription,

        price: priceValue !== null && priceValue !== undefined
            ? priceValue
            : null,

        compareAtPrice: null,

        currency: priceCurrency,

        images: uniqueProductImages,

        availability,

        hasVariants: Boolean(
            productSchema?.offers &&
            Array.isArray(productSchema.offers) &&
            productSchema.offers.length > 1
        ),

        hasProductSchema: Boolean(productSchema),

        reviews: {
            count: reviewCount,
            rating: ratingValue
        },

        shipping: {
            mentioned: /shipping|delivery/i.test(bodyLower)
        },

        returns: {
            mentioned: /return policy|returns accepted|return an item/i.test(
                bodyLower
            )
        }
    };

    /* -----------------------------------------------
       PLATFORM-SPECIFIC SIGNALS
    ------------------------------------------------ */

    const lowerHtml = String(html || "").toLowerCase();

    const shopifySignalNames = [
        "cdn.shopify.com",
        "cdn.shopifycdn.net",
        "shopify-payment-button",
        "/cdn/shop/",
        "shopify-section",
        "shopifyanalytics",
        "shopify.routes"
    ];

    const matchedShopifySignals =
        shopifySignalNames.filter((signal) =>
            lowerHtml.includes(signal)
        );

    const platformSignals = {
        shopify: matchedShopifySignals,
        shopifySignalCount: matchedShopifySignals.length,
        etsy: platform === "etsy"
    };

    const isEtsyListing = isEtsyListingUrl(pageUrl);

    const isShopifyProduct =
        platform === "shopify" &&
        parsedPageUrl &&
        isProductPath(parsedPageUrl.pathname);

    const addToCartSignals = [
        /add to cart/i.test(visibleBodyText),
        /add to basket/i.test(visibleBodyText),
        /buy it now/i.test(visibleBodyText),
        /add to bag/i.test(visibleBodyText)
    ].filter(Boolean).length;

    const hasShopifyProductForm =
        $("form[action*='/cart/add']").length > 0 ||
        $("form[action*='cart/add']").length > 0;

    const hasShopifyBuyNow =
        $("shopify-payment-button").length > 0 ||
        $(".shopify-payment-button").length > 0;

    const hasEtsyPurchaseControls =
        isEtsyListing &&
        (
            /add to cart|buy it now|add to basket/i.test(
                visibleBodyText
            ) ||
            $("[data-buy-box-region]").length > 0
        );

    const signals = {
        addToCart: addToCartSignals > 0,
        addToCartSignalCount: addToCartSignals,

        shopifyProductForm:
            Boolean(hasShopifyProductForm),

        shopifyBuyNow:
            Boolean(hasShopifyBuyNow),

        etsyPurchaseControls:
            Boolean(hasEtsyPurchaseControls),

        reviewsMentioned:
            /review|reviews|ratings/i.test(bodyLower),

        shippingMentioned:
            /shipping|delivery/i.test(bodyLower),

        returnsMentioned:
            /returns accepted|return policy|returns policy/i.test(
                bodyLower
            ),

        productPage:
            Boolean(isEtsyListing || isShopifyProduct),

        hasProductSchema:
            Boolean(productSchema)
    };

    /* -----------------------------------------------
       SEO
    ------------------------------------------------ */

    const seo = {
        title,
        metaDescription,
        canonicalUrl,
        robots,
        language: htmlLanguage,

        titleLength: title
            ? title.length
            : 0,

        descriptionLength: metaDescription
            ? metaDescription.length
            : 0,

        hasTitle: Boolean(title),
        hasMetaDescription: Boolean(metaDescription),
        hasCanonical: Boolean(canonicalUrl),

        openGraph: {
            title: ogTitle,
            description: ogDescription,
            image: ogImage,
            siteName: ogSiteName
        }
    };

    /* -----------------------------------------------
       FINAL RESULT
    ------------------------------------------------ */

    return {
        url: pageUrl,

        storeName,

        platform,

        platformSignals,

        seo,

        product,

        productDiscovery,

        headings,

        images: {
            total: uniqueImages.length,

            withoutAlt: uniqueImages.filter(
                (image) => !image.alt
            ).length,

            items: uniqueImages
        },

        links: {
            total: links.length,
            items: links
        },

        forms: {
            total: forms.length,
            items: forms
        },

        buttons: {
            total: buttons.length,
            items: buttons
        },

        openGraph: {
            title: ogTitle,
            description: ogDescription,
            image: ogImage,
            siteName: ogSiteName
        },

        structuredData: {
            count: structuredData.length,

            hasProductSchema:
                Boolean(productSchema),

            product: productSchema,

            organization:
                organizationSchema,

            items: structuredData
        },

        signals,

        bodyTextLength:
            visibleBodyText.length
    };
};


/* =========================================================
   EXPORT
========================================================= */

module.exports = {
    extractPageData,

    normalizeUrl,
    isSameDomain,

    isProductPath,
    isGiftCardUrl,

    isEtsyHost,
    isEtsyShopUrl,
    isEtsyListingUrl,

    detectPlatform
};