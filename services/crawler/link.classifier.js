const { URL } = require("url");


/* =========================================================
   HELPERS
========================================================= */

const normalizeHostname = (hostname = "") =>
    hostname
        .replace(/^www\./, "")
        .toLowerCase();


const isSameDomain = (url, baseUrl) => {

    return (
        normalizeHostname(url.hostname) ===
        normalizeHostname(baseUrl.hostname)
    );

};


const normalizeUrl = (url) => {

    url.hash = "";
    url.search = "";

    return url
        .toString()
        .replace(/\/$/, "");

};


const isProductPath = (pathname = "") => {

    const normalized =
        pathname
            .toLowerCase()
            .replace(/\/+/g, "/");

    return (
        normalized === "/products" ||
        normalized.includes("/products/")
    );

};


const isGiftCardProduct = (
    pathname = ""
) => {

    const normalized =
        pathname.toLowerCase();

    return (
        normalized.includes(
            "/products/gift-card"
        ) ||
        normalized.includes(
            "/products/giftcard"
        )
    );

};


/* =========================================================
   LINK CLASSIFIER
========================================================= */

const classifyLinks = (
    links = [],
    baseUrl
) => {

    let base;

    try {

        base =
            new URL(baseUrl);

    } catch {

        return {
            products: [],
            ignored: [],
            collections: [],
            importantPages: []
        };

    }


    const seen =
        new Set();

    const products = [];
    const ignored = [];


    for (
        const link of links
    ) {

        if (
            !link ||
            !link.href
        ) {
            continue;
        }


        let url;

        try {

            url =
                new URL(
                    link.href,
                    baseUrl
                );

        } catch {

            continue;

        }


        /* =====================================================
           HTTP / HTTPS ONLY
        ===================================================== */

        if (
            url.protocol !== "http:" &&
            url.protocol !== "https:"
        ) {
            continue;
        }


        /* =====================================================
           SAME DOMAIN
        ===================================================== */

        if (
            !isSameDomain(
                url,
                base
            )
        ) {

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
            url.pathname
                .toLowerCase();


        const normalizedUrl =
            normalizeUrl(
                url
            );


        /* =====================================================
           DUPLICATE
        ===================================================== */

        if (
            seen.has(
                normalizedUrl
            )
        ) {
            continue;
        }

        seen.add(
            normalizedUrl
        );


        const cleanLink = {

            text:
                typeof link.text === "string"
                    ? link.text
                        .replace(/\s+/g, " ")
                        .trim()
                    : "",

            href:
                normalizedUrl

        };


        /* =====================================================
           PRODUCT
        ===================================================== */

        if (
            isProductPath(
                pathname
            )
        ) {

            /*
             * /products itself is an index page,
             * not a product.
             */

            if (
                pathname ===
                "/products"
            ) {

                ignored.push({
                    ...cleanLink,
                    reason:
                        "products_index"
                });

                continue;
            }


            /*
             * Ignore gift cards.
             */

            if (
                isGiftCardProduct(
                    pathname
                )
            ) {

                ignored.push({
                    ...cleanLink,
                    reason:
                        "gift_card"
                });

                continue;
            }


            products.push(
                cleanLink
            );

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


    return {

        products,

        ignored,

        collections: [],

        importantPages: []

    };

};


module.exports = {
    classifyLinks
};