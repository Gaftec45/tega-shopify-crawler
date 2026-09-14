const { URL } = require("url");

/* =========================================================
   HELPERS
========================================================= */

const normalizeHostname = (hostname) =>
    hostname.replace(/^www\./, "").toLowerCase();


const isSameDomain = (url, baseUrl) => {
    return (
        normalizeHostname(url.hostname) ===
        normalizeHostname(baseUrl.hostname)
    );
};


const normalizeProductUrl = (url) => {
    url.search = "";
    url.hash = "";

    // Shopify product URLs should not have a trailing slash
    return url.toString().replace(/\/$/, "");
};


/* =========================================================
   LINK CLASSIFIER
========================================================= */

const classifyLinks = (links = [], baseUrl) => {
    const base = new URL(baseUrl);

    const seen = new Set();

    const products = [];
    const ignored = [];

    for (const link of links) {

        if (!link || !link.href) {
            continue;
        }

        let url;

        try {
            url = new URL(
                link.href,
                baseUrl
            );
        } catch {
            continue;
        }


        /* =====================================================
           ONLY HTTP / HTTPS
        ===================================================== */

        if (
            url.protocol !== "http:" &&
            url.protocol !== "https:"
        ) {
            continue;
        }


        /* =====================================================
           SAME DOMAIN ONLY
        ===================================================== */

        if (!isSameDomain(url, base)) {
            ignored.push({
                ...link,
                reason: "external"
            });

            continue;
        }


        /* =====================================================
           NORMALIZE
        ===================================================== */

        const pathname =
            url.pathname.toLowerCase();

        const normalizedUrl =
            normalizeProductUrl(url);


        /* =====================================================
           DUPLICATES
        ===================================================== */

        if (seen.has(normalizedUrl)) {
            continue;
        }

        seen.add(normalizedUrl);


        const cleanLink = {
            text:
                typeof link.text === "string"
                    ? link.text.trim()
                    : "",

            href: normalizedUrl
        };


        /* =====================================================
           SHOPIFY PRODUCT
        ===================================================== */

        if (
    pathname === "/products" ||
    pathname.startsWith("/products/")
) {

    if (pathname === "/products") {
        ignored.push({
            ...cleanLink,
            reason: "products_index"
        });

        continue;
    }

    if (
        pathname.includes("/products/gift-card") ||
        pathname.includes("/products/giftcard")
    ) {
        ignored.push({
            ...cleanLink,
            reason: "gift_card"
        });

        continue;
    }

    products.push(cleanLink);

    continue;
}


        /* =====================================================
           EVERYTHING ELSE
        ===================================================== */

        ignored.push({
            ...cleanLink,
            reason: "other"
        });
    }


    /* =========================================================
       RESULT
    ========================================================= */

    return {
        products,
        ignored,

        // Kept for compatibility with existing code
        collections: [],
        importantPages: []
    };
};


module.exports = {
    classifyLinks
};