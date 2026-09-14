const buildAiAuditPayload = (crawlData, audit) => {
    const allProducts =
    crawlData.products?.items || [];

const products =
    allProducts.filter(
        (product) =>
            product?.success === true &&
            product?.crawlStatus === "completed"
    );

const failedProducts =
    allProducts.filter(
        (product) =>
            product?.success !== true ||
            product?.crawlStatus !== "completed"
    );

    return {
        auditScope: {
            pagesAnalyzed: [
                "homepage",
                "sampled product pages"
            ],

            maxProductPages: 3,

            note:
                "This audit currently analyzes the homepage and up to 3 sampled product pages only. Collection pages, contact pages, about pages, policy pages, FAQ pages, blog pages, and other pages are not evaluated unless they are part of the crawled homepage/product data."
        },

        sampledProducts: {
    requested: allProducts.length,
    successfullyAnalyzed: products.length,
    failed: failedProducts.length
},

        store: {
            requestedUrl:
                crawlData.requestedUrl || null,

            finalUrl:
                crawlData.finalUrl || null,

            title:
                crawlData.title || null
        },

        score: audit.score,

        homepage: {
            seo: {
                title:
                    crawlData.homepage?.seo?.title || null,

                titleLength:
                    crawlData.homepage?.seo?.titleLength || 0,

                metaDescription:
                    crawlData.homepage?.seo?.metaDescription || null,

                metaDescriptionLength:
                    crawlData.homepage?.seo?.metaDescriptionLength || 0,

                canonical:
                    crawlData.homepage?.seo?.canonical || null,

                h1Count:
                    crawlData.homepage?.headings?.h1?.length || 0,

                h2Count:
                    crawlData.homepage?.headings?.h2?.length || 0,

                h3Count:
                    crawlData.homepage?.headings?.h3?.length || 0
            },

            images: {
                total:
                    crawlData.homepage?.images?.total || 0,

                withoutAlt:
                    crawlData.homepage?.images?.withoutAlt || 0
            },

            openGraph:
                crawlData.homepage?.openGraph || {},

            structuredData: {
                count:
                    crawlData.homepage?.structuredData?.count || 0
            },

            signals:
                crawlData.homepage?.signals || {}
        },

products: products.map((product) => {

    const signals =
        product.signals || {};

    const conversion =
        product.conversion || {};

    const shopify =
        product.shopify || {};

    const description =
        product.description || {};

    const descriptionLength =
        description.length ||
        description.text?.length ||
        0;

    const hasAddToCart =
        signals.hasAddToCart === true ||
        conversion.hasAddToCart === true;

    const hasProductForm =
        signals.hasProductForm === true ||
        conversion.hasProductForm === true;

    const hasBuyNow =
        signals.hasBuyNow === true ||
        conversion.hasBuyNow === true;

    const purchaseCtaCount =
        signals.purchaseCtaCount ||
        conversion.purchaseCtaCount ||
        0;

    return {

        url:
            product.url || null,

        title:
            product.title || null,

        description: {
            length:
                descriptionLength,

            present:
                descriptionLength > 0
        },

        crawlMethod:
            product.crawlMethod || null,

        images: {
            total:
                product.images?.total || 0,

            withoutAlt:
                product.images?.withoutAlt || 0
        },

        purchaseSignals: {

            hasAddToCart,

            hasProductForm,

            hasBuyNow,

            purchaseCtaCount,

            purchaseActionDetected:
                hasAddToCart ||
                hasProductForm ||
                hasBuyNow
        },

        conversion: {

            hasReviews:
                conversion.hasReviews === true,

            hasShippingInfo:
                conversion.hasShippingInfo === true,

            hasReturnInfo:
                conversion.hasReturnInfo === true
        },

        shopify: {

            availability:
                shopify.availability || {},

            pricing:
                shopify.pricing || {}
        },

        structuredData: {

            hasProductSchema:
                product.structuredData
                    ?.hasProductSchema === true
        }
    };
}),

        findings: {
            seo:
                audit.seo,

            products:
                audit.products,

            conversion:
                audit.conversion,

            ux:
                audit.ux,

            technical:
                audit.technical
        }
    };
};

module.exports = {
    buildAiAuditPayload
};