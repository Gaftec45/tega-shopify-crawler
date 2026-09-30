const cheerio = require("cheerio");

const extractPageData = (html, pageUrl) => {
    const $ = cheerio.load(html);

    // =========================================================
    // HELPERS
    // =========================================================

    const cleanText = (value) => {
        if (value === null || value === undefined) {
            return null;
        }

        const cleaned = String(value)
            .replace(/\s+/g, " ")
            .trim();

        return cleaned || null;
    };

    const parseJson = (value) => {
        if (!value) {
            return null;
        }

        try {
            return JSON.parse(value);
        } catch {
            return null;
        }
    };

    const normalizeUrl = (url) => {
        if (!url) {
            return null;
        }

        try {
            const resolved = new URL(url, pageUrl);

            if (
                resolved.protocol !== "http:" &&
                resolved.protocol !== "https:"
            ) {
                return null;
            }

            resolved.hash = "";

            return resolved.toString();
        } catch {
            return null;
        }
    };

    const isProductPath = (url) => {
        if (!url) {
            return false;
        }

        try {
            const parsed = new URL(url, pageUrl);

            const segments = parsed.pathname
                .toLowerCase()
                .split("/")
                .filter(Boolean);

            const productIndex = segments.indexOf("products");

            if (productIndex === -1) {
                return false;
            }

            // /products is collection/index page
            // /en/products is also collection/index page
            if (!segments[productIndex + 1]) {
                return false;
            }

            return true;
        } catch {
            return false;
        }
    };

    const isSameDomain = (url) => {
        try {
            const target = new URL(url, pageUrl);
            const base = new URL(pageUrl);

            const normalizeHostname = (hostname) =>
                hostname
                    .replace(/^www\./i, "")
                    .toLowerCase();

            return (
                normalizeHostname(target.hostname) ===
                normalizeHostname(base.hostname)
            );
        } catch {
            return false;
        }
    };

    const isGiftCardUrl = (url) => {
        if (!url) {
            return false;
        }

        try {
            const pathname = new URL(url, pageUrl)
                .pathname
                .toLowerCase();

            return (
                pathname.includes("/products/gift-card") ||
                pathname.includes("/products/giftcard") ||
                pathname.includes("/products/gift_card")
            );
        } catch {
            return false;
        }
    };

    const findProductSchema = (data) => {
        if (!data) {
            return null;
        }

        if (Array.isArray(data)) {
            for (const item of data) {
                const product = findProductSchema(item);

                if (product) {
                    return product;
                }
            }

            return null;
        }

        if (typeof data !== "object") {
            return null;
        }

        const type = data["@type"];

        if (
            type === "Product" ||
            (Array.isArray(type) &&
                type.includes("Product"))
        ) {
            return data;
        }

        if (Array.isArray(data["@graph"])) {
            return findProductSchema(data["@graph"]);
        }

        return null;
    };

    const findOrganizationName = (data) => {
        if (!data) {
            return null;
        }

        if (Array.isArray(data)) {
            for (const item of data) {
                const name =
                    findOrganizationName(item);

                if (name) {
                    return name;
                }
            }

            return null;
        }

        if (typeof data !== "object") {
            return null;
        }

        const type = data["@type"];

        if (
            type === "Organization" ||
            type === "LocalBusiness" ||
            (Array.isArray(type) &&
                (
                    type.includes("Organization") ||
                    type.includes("LocalBusiness")
                ))
        ) {
            return cleanText(data.name);
        }

        if (Array.isArray(data["@graph"])) {
            return findOrganizationName(
                data["@graph"]
            );
        }

        return null;
    };

    // =========================================================
    // BASIC SEO
    // =========================================================

    const title = $("title")
        .first()
        .text()
        .trim();

    const metaDescription =
        $('meta[name="description"]')
            .attr("content")
            ?.trim() || null;

    const canonical =
        $('link[rel="canonical"]')
            .attr("href")
            ?.trim() || null;

    // =========================================================
    // HEADINGS
    // =========================================================

    const headings = {
        h1: $("h1")
            .map((_, element) =>
                $(element)
                    .text()
                    .trim()
            )
            .get()
            .filter(Boolean),

        h2: $("h2")
            .map((_, element) =>
                $(element)
                    .text()
                    .trim()
            )
            .get()
            .filter(Boolean),

        h3: $("h3")
            .map((_, element) =>
                $(element)
                    .text()
                    .trim()
            )
            .get()
            .filter(Boolean)
    };

    // =========================================================
    // IMAGES
    // =========================================================

    const images = $("img")
        .map((_, element) => ({
            src:
                $(element).attr("src") ||
                $(element).attr("data-src") ||
                $(element).attr("data-original") ||
                $(element).attr("data-lazy-src") ||
                null,

            alt:
                $(element)
                    .attr("alt")
                    ?.trim() || null
        }))
        .get();

    const imagesWithoutAlt =
        images.filter(
            (image) => !image.alt
        );

    // =========================================================
    // LINKS
    // =========================================================

    const links = $("a[href]")
        .map((_, element) => ({
            text:
                $(element)
                    .text()
                    .replace(/\s+/g, " ")
                    .trim(),

            href:
                $(element).attr("href") ||
                null
        }))
        .get();

    // =========================================================
    // PRODUCT URL DISCOVERY
    //
    // Handles:
    // /products/product-name
    // /en/products/product-name
    // /de/products/product-name
    // /fr/products/product-name
    // /en-US/products/product-name
    // =========================================================

    const discoveredProductUrls = [];
    const productUrlSet = new Set();

    const addProductUrl = (
        rawUrl,
        source = "unknown"
    ) => {
        if (!rawUrl) {
            return;
        }

        const normalizedUrl =
            normalizeUrl(rawUrl);

        if (!normalizedUrl) {
            return;
        }

        if (!isSameDomain(normalizedUrl)) {
            return;
        }

        if (!isProductPath(normalizedUrl)) {
            return;
        }

        if (isGiftCardUrl(normalizedUrl)) {
            return;
        }

        if (
            productUrlSet.has(
                normalizedUrl
            )
        ) {
            return;
        }

        productUrlSet.add(normalizedUrl);

        discoveredProductUrls.push({
            url: normalizedUrl,
            source
        });
    };

    // ---------------------------------------------------------
    // Product URLs from anchors
    // ---------------------------------------------------------

    for (const link of links) {
        addProductUrl(
            link.href,
            "anchor"
        );
    }

    // ---------------------------------------------------------
    // Product URLs from canonical URL
    // ---------------------------------------------------------

    if (canonical) {
        addProductUrl(
            canonical,
            "canonical"
        );
    }

    // ---------------------------------------------------------
    // Product URLs from structured data
    // ---------------------------------------------------------

    // This is useful for product pages and stores that expose
    // product URLs through JSON-LD.
    //
    // We recursively search structured data for:
    // - url
    // - @id
    // - item
    // - mainEntityOfPage
    // ---------------------------------------------------------

    const collectProductUrlsFromJson = (
        data,
        source = "structured_data"
    ) => {
        if (!data) {
            return;
        }

        if (Array.isArray(data)) {
            for (const item of data) {
                collectProductUrlsFromJson(
                    item,
                    source
                );
            }

            return;
        }

        if (
            typeof data !== "object"
        ) {
            return;
        }

        const type = data["@type"];

        const isProduct =
            type === "Product" ||
            (
                Array.isArray(type) &&
                type.includes("Product")
            );

        if (isProduct) {
            if (data.url) {
                addProductUrl(
                    data.url,
                    source
                );
            }

            if (data["@id"]) {
                addProductUrl(
                    data["@id"],
                    source
                );
            }

            if (
                data.mainEntityOfPage
            ) {
                if (
                    typeof data.mainEntityOfPage ===
                    "string"
                ) {
                    addProductUrl(
                        data.mainEntityOfPage,
                        source
                    );
                }

                if (
                    typeof data.mainEntityOfPage ===
                    "object"
                ) {
                    addProductUrl(
                        data.mainEntityOfPage.url,
                        source
                    );

                    addProductUrl(
                        data.mainEntityOfPage["@id"],
                        source
                    );
                }
            }
        }

        // Search nested graph
        if (data["@graph"]) {
            collectProductUrlsFromJson(
                data["@graph"],
                source
            );
        }

        // Search item
        if (data.item) {
            collectProductUrlsFromJson(
                data.item,
                source
            );
        }

        // Search mainEntity
        if (data.mainEntity) {
            collectProductUrlsFromJson(
                data.mainEntity,
                source
            );
        }
    };

    // =========================================================
    // FORMS
    // =========================================================

    const forms = $("form")
        .map((_, element) => ({
            action:
                $(element).attr("action") ||
                null,

            method:
                $(element).attr("method") ||
                "get"
        }))
        .get();

    // =========================================================
    // BUTTONS
    // =========================================================

    const buttons = $(
        "button, input[type='submit'], input[type='button']"
    )
        .map((_, element) => ({
            text:
                $(element).text().trim() ||
                $(element)
                    .attr("value")
                    ?.trim() ||
                null,

            type:
                $(element).attr("type") ||
                null,

            name:
                $(element).attr("name") ||
                null,

            id:
                $(element).attr("id") ||
                null,

            class:
                $(element).attr("class") ||
                null
        }))
        .get();

    // =========================================================
    // OPEN GRAPH
    // =========================================================

    const openGraph = {
        title:
            $('meta[property="og:title"]')
                .attr("content") ||
            null,

        description:
            $('meta[property="og:description"]')
                .attr("content") ||
            null,

        image:
            $('meta[property="og:image"]')
                .attr("content") ||
            null,

        url:
            $('meta[property="og:url"]')
                .attr("content") ||
            null
    };

    // =========================================================
    // ROBOTS
    // =========================================================

    const robots =
        $('meta[name="robots"]')
            .attr("content")
            ?.trim() ||
        null;

    // =========================================================
    // STRUCTURED DATA
    // =========================================================

    const structuredData = $(
        'script[type="application/ld+json"]'
    )
        .map((_, element) =>
            $(element).html()
        )
        .get();

    // =========================================================
    // PARSE STRUCTURED DATA FOR PRODUCT DISCOVERY
    // =========================================================

    for (const rawJson of structuredData) {
        const parsed = parseJson(rawJson);

        collectProductUrlsFromJson(
            parsed,
            "structured_data"
        );
    }

    // =========================================================
    // STORE / BRAND NAME
    // =========================================================

    const openGraphSiteName =
        cleanText(
            $('meta[property="og:site_name"]')
                .attr("content")
        );

    let organizationName = null;

    for (const rawJson of structuredData) {
        const parsed =
            parseJson(rawJson);

        organizationName =
            findOrganizationName(parsed);

        if (organizationName) {
            break;
        }
    }

    // =========================================================
    // PLATFORM DETECTION
    // =========================================================

    const htmlLower =
        String(html || "")
            .toLowerCase();

    const shopifySignals = {
        cdnShopify:
            htmlLower.includes(
                "cdn.shopify.com"
            ),

        cdnShopifyCdn:
            htmlLower.includes(
                "cdn.shopifycdn.net"
            ),

        shopifyTheme:
            htmlLower.includes(
                "shopify.theme"
            ),

        shopifyRoutes:
            htmlLower.includes(
                "shopify.routes"
            ),

        shopifyPaymentButton:
            htmlLower.includes(
                "shopify-payment-button"
            ),

        shopifyPay:
            htmlLower.includes(
                "/shopify_pay/"
            ),

        shopifyAnalytics:
            htmlLower.includes(
                "ep.shopify_event_name"
            ),

        shopifyCdnShop:
            htmlLower.includes(
                "/cdn/shop/"
            ),

        shopifyFonts:
            htmlLower.includes(
                "/cdn/fonts/"
            ),

        shopifyCart:
            htmlLower.includes(
                "/cart/add"
            ),

        shopifyProductJson:
            htmlLower.includes(
                ".js"
            ) &&
            (
                htmlLower.includes(
                    "product"
                )
            )
    };

    const shopifySignalCount =
        Object.values(
            shopifySignals
        ).filter(Boolean).length;

    let platform = "unknown";

    try {
        const hostname =
            new URL(pageUrl)
                .hostname
                .toLowerCase();

        if (
            hostname.endsWith(
                ".myshopify.com"
            )
        ) {
            platform = "shopify";
        } else if (
            shopifySignalCount >= 2
        ) {
            platform = "shopify";
        }
    } catch {
        if (
            shopifySignalCount >= 2
        ) {
            platform = "shopify";
        }
    }

    // =========================================================
    // PRODUCT STRUCTURED DATA
    // =========================================================

    let productSchema = null;

    for (const rawJson of structuredData) {
        const parsed =
            parseJson(rawJson);

        const product =
            findProductSchema(parsed);

        if (product) {
            productSchema = product;
            break;
        }
    }

    // =========================================================
    // PRODUCT TITLE
    // =========================================================

    const productTitle =
        cleanText(
            productSchema?.name
        ) ||

        cleanText(
            $('[itemprop="name"]')
                .first()
                .text()
        ) ||

        cleanText(
            $('[data-product-title]')
                .first()
                .text()
        ) ||

        cleanText(
            $(".product__title")
                .first()
                .text()
        ) ||

        cleanText(
            $(".product-title")
                .first()
                .text()
        ) ||

        cleanText(
            $('meta[property="og:title"]')
                .attr("content")
        ) ||

        cleanText(
            $("h1")
                .first()
                .text()
        ) ||

        null;

    // =========================================================
    // PRODUCT DESCRIPTION
    // =========================================================

    const productDescription =
        cleanText(
            productSchema?.description
        ) ||

        cleanText(
            $('[itemprop="description"]')
                .first()
                .text()
        ) ||

        cleanText(
            $('[data-product-description]')
                .first()
                .text()
        ) ||

        cleanText(
            $(".product__description")
                .first()
                .text()
        ) ||

        cleanText(
            $(".product-description")
                .first()
                .text()
        ) ||

        null;

    // =========================================================
    // PRODUCT OFFERS
    // =========================================================

    let primaryOffer = null;

    if (
        Array.isArray(
            productSchema?.offers
        )
    ) {
        primaryOffer =
            productSchema.offers[0] ||
            null;
    } else if (
        productSchema?.offers &&
        typeof productSchema.offers ===
            "object"
    ) {
        primaryOffer =
            productSchema.offers;
    }

    // =========================================================
    // PRODUCT PRICE
    // =========================================================

    const schemaPrice =
        primaryOffer?.price ??
        null;

    const domPrice =
        $('[itemprop="price"]')
            .first()
            .attr("content") ||

        $('[itemprop="price"]')
            .first()
            .text()
            .trim() ||

        $('[data-product-price]')
            .first()
            .attr("data-product-price") ||

        $('[data-price]')
            .first()
            .attr("data-price") ||

        $(".product__price")
            .first()
            .text()
            .trim() ||

        $(".product-price")
            .first()
            .text()
            .trim() ||

        null;

    const productPrice =
        schemaPrice ??
        cleanText(domPrice);

    // =========================================================
    // PRODUCT COMPARE-AT PRICE
    // =========================================================

    const schemaCompareAtPrice =
        primaryOffer
            ?.priceSpecification
            ?.price ??
        null;

    const domCompareAtPrice =
        $('[data-compare-price]')
            .first()
            .attr(
                "data-compare-price"
            ) ||

        $('[data-compare-at-price]')
            .first()
            .attr(
                "data-compare-at-price"
            ) ||

        $(".compare-at-price")
            .first()
            .text()
            .trim() ||

        $(".product__compare-price")
            .first()
            .text()
            .trim() ||

        null;

    const productCompareAtPrice =
        schemaCompareAtPrice ??
        cleanText(
            domCompareAtPrice
        );

    // =========================================================
    // PRODUCT CURRENCY
    // =========================================================

    const productCurrency =
        primaryOffer?.priceCurrency ||

        $('[itemprop="priceCurrency"]')
            .first()
            .attr("content") ||

        $('[data-currency]')
            .first()
            .attr("data-currency") ||

        null;

    // =========================================================
    // PRODUCT IMAGES
    // =========================================================

    const productImages = [];

    if (productSchema?.image) {
        if (
            Array.isArray(
                productSchema.image
            )
        ) {
            productImages.push(
                ...productSchema.image
            );
        } else {
            productImages.push(
                productSchema.image
            );
        }
    }

    $('[itemprop="image"]').each(
        (_, element) => {
            const src =
                $(element).attr("src") ||
                $(element).attr("content") ||
                $(element).attr("data-src");

            if (src) {
                productImages.push(src);
            }
        }
    );

    $(
        [
            ".product__media img",
            ".product-media img",
            ".product-gallery img",
            ".product__image img",
            ".product-image img"
        ].join(", ")
    ).each((_, element) => {
        const src =
            $(element).attr("src") ||
            $(element).attr("data-src") ||
            $(element).attr("data-original");

        if (src) {
            productImages.push(src);
        }
    });

    const uniqueProductImages = [
        ...new Set(
            productImages.filter(Boolean)
        )
    ];

    // =========================================================
    // PRODUCT AVAILABILITY
    // =========================================================

    const schemaAvailability =
        primaryOffer?.availability ||
        null;

    let productAvailable = null;

    if (schemaAvailability) {
        const availability =
            String(
                schemaAvailability
            ).toLowerCase();

        if (
            availability.includes(
                "outofstock"
            )
        ) {
            productAvailable = false;
        } else if (
            availability.includes(
                "instock"
            )
        ) {
            productAvailable = true;
        }
    }

    // =========================================================
    // PRODUCT VARIANT SIGNALS
    // =========================================================

    const variantInputs = $(
        [
            "select[name*='option']",
            "select[name*='variant']",
            "input[name*='option']",
            "input[name='id']",
            "input[name='variant']"
        ].join(", ")
    ).length;

    const hasVariants =
        variantInputs > 0;

    // =========================================================
    // BODY TEXT
    // =========================================================

    const bodyText = $("body")
        .text()
        .replace(/\s+/g, " ")
        .trim();

    const bodyTextLower =
        bodyText.toLowerCase();

    // =========================================================
    // REVIEWS
    // =========================================================

    const reviewKeywords = [
        "reviews",
        "review",
        "customer reviews",
        "customer review",
        "ratings",
        "rating",
        "stars",
        "star rating"
    ];

    const hasReviews =
        reviewKeywords.some(
            (keyword) =>
                bodyTextLower.includes(
                    keyword
                )
        );

    // =========================================================
    // SHIPPING / RETURNS
    // =========================================================

    const shippingKeywords = [
        "shipping",
        "delivery",
        "ships",
        "free shipping",
        "shipping information",
        "delivery information"
    ];

    const returnKeywords = [
        "returns",
        "return policy",
        "refund",
        "refund policy",
        "exchange",
        "exchanges"
    ];

    const hasShipping =
        shippingKeywords.some(
            (keyword) =>
                bodyTextLower.includes(
                    keyword
                )
        );

    const hasReturns =
        returnKeywords.some(
            (keyword) =>
                bodyTextLower.includes(
                    keyword
                )
        );

    // =========================================================
    // PRODUCT DATA
    // =========================================================

    const product = {
        title: productTitle,

        description:
            productDescription,

        descriptionLength:
            productDescription?.length || 0,

        price:
            productPrice,

        compareAtPrice:
            productCompareAtPrice,

        currency:
            productCurrency,

        images: {
            total:
                uniqueProductImages.length,

            items:
                uniqueProductImages
        },

        availability:
            productAvailable,

        hasVariants,

        hasReviews,

        hasShipping,

        hasReturns,

        hasProductSchema:
            Boolean(productSchema)
    };

    // =========================================================
    // BASIC STORE SIGNALS
    // =========================================================

    const hasEmailCapture =
        $("input[type='email']")
            .length > 0;

    const hasContactForm =
        forms.length > 0;

    // =========================================================
    // PURCHASE / ADD TO CART DETECTION
    // =========================================================

    const addToCartKeywords = [
        "add to cart",
        "add to bag",
        "add bag",
        "buy now",
        "purchase",
        "shop now",
        "in den warenkorb",
        "in den einkaufswagen",
        "jetzt kaufen",
        "ajouter au panier",
        "añadir al carrito",
        "agregar al carrito",
        "adicionar ao carrinho"
    ];

    const isPurchaseText = (
        text = ""
    ) => {
        const normalized =
            text
                .replace(/\s+/g, " ")
                .trim()
                .toLowerCase();

        return addToCartKeywords.some(
            (keyword) =>
                normalized.includes(
                    keyword
                )
        );
    };

    // =========================================================
    // TEXT-BASED CTA DETECTION
    // =========================================================

    const purchaseButtons = $(
        "button, input[type='submit'], input[type='button'], a"
    )
        .filter((_, element) => {
            const text =
                $(element).text() ||
                $(element).attr("value") ||
                $(element).attr("aria-label") ||
                $(element).attr("title") ||
                "";

            return isPurchaseText(text);
        })
        .length;

    // =========================================================
    // SHOPIFY PRODUCT FORM
    // =========================================================

    const productForms = $(
        "form[action*='/cart/add'], form[action*='/cart/add.js']"
    ).length;

    // =========================================================
    // SHOPIFY ADD BUTTON
    // =========================================================

    const shopifyAddButtons = $(
        [
            "button[name='add']",
            "input[name='add']",
            "button[data-add-to-cart]",
            "[data-add-to-cart]",
            ".add-to-cart",
            ".add-to-cart-button",
            ".product-form__submit",
            "[name='add']"
        ].join(", ")
    ).length;

    // =========================================================
    // PRODUCT FORM SUBMIT
    // =========================================================

    const productFormSubmitButtons = $(
        "form[action*='/cart/add'] button[type='submit'], " +
        "form[action*='/cart/add'] input[type='submit']"
    ).length;

    // =========================================================
    // BUY NOW / DYNAMIC CHECKOUT
    // =========================================================

    const buyNowButtons = $(
        [
            "[data-buy-now]",
            ".shopify-payment-button",
            ".shopify-payment-button__button",
            "[name='checkout']"
        ].join(", ")
    ).length;

    // =========================================================
    // FINAL PURCHASE DECISION
    // =========================================================

    const hasProductForm =
        productForms > 0;

    const hasAddToCart =
        purchaseButtons > 0 ||
        productForms > 0 ||
        shopifyAddButtons > 0 ||
        productFormSubmitButtons > 0;

    const hasBuyNow =
        buyNowButtons > 0;

    const purchaseCtaCount =
        purchaseButtons +
        shopifyAddButtons +
        productFormSubmitButtons +
        buyNowButtons;

    // =========================================================
    // FINAL STORE NAME
    // =========================================================

    const storeName =
        openGraphSiteName ||
        organizationName ||
        cleanText(title) ||
        null;

    // =========================================================
    // RETURN
    // =========================================================

    return {
        url: pageUrl,

        storeName,

        // =====================================================
        // PLATFORM
        // =====================================================

        platform,

        platformSignals: {
            shopify: shopifySignals,
            shopifySignalCount
        },

        // =====================================================
        // SEO
        // =====================================================

        seo: {
            title,

            titleLength:
                title.length,

            metaDescription,

            metaDescriptionLength:
                metaDescription?.length || 0,

            canonical,

            robots
        },

        // =====================================================
        // PRODUCT
        // =====================================================

        product,

        // =====================================================
        // PRODUCT DISCOVERY
        // =====================================================

        productDiscovery: {
            total:
                discoveredProductUrls.length,

            urls:
                discoveredProductUrls
        },

        // =====================================================
        // HEADINGS
        // =====================================================

        headings,

        // =====================================================
        // IMAGES
        // =====================================================

        images: {
            total:
                images.length,

            withoutAlt:
                imagesWithoutAlt.length,

            items:
                images
        },

        // =====================================================
        // LINKS
        // =====================================================

        links: {
            total:
                links.length,

            items:
                links
        },

        // =====================================================
        // FORMS
        // =====================================================

        forms: {
            total:
                forms.length,

            items:
                forms
        },

        // =====================================================
        // BUTTONS
        // =====================================================

        buttons: {
            total:
                buttons.length,

            items:
                buttons
        },

        // =====================================================
        // OPEN GRAPH
        // =====================================================

        openGraph,

        // =====================================================
        // STRUCTURED DATA
        // =====================================================

        structuredData: {
            count:
                structuredData.length,

            items:
                structuredData,

            hasProductSchema:
                Boolean(productSchema),

            product:
                productSchema
        },

        // =====================================================
        // SIGNALS
        // =====================================================

        signals: {
            hasEmailCapture,

            hasContactForm,

            hasAddToCart,

            hasBuyNow,

            hasProductForm,

            purchaseCtaCount,

            purchaseSignals: {
                purchaseButtons,

                productForms,

                shopifyAddButtons,

                productFormSubmitButtons,

                buyNowButtons
            }
        },

        // =====================================================
        // BODY
        // =====================================================

        bodyTextLength:
            bodyText.length
    };
};

module.exports = {
    extractPageData
};