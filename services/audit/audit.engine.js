const { auditSEO } = require("./seo.audit");
const { auditProducts } = require("./product.audit");
const { auditConversion } = require("./conversion.audit");
const { auditUX } = require("./ux.audit");
const { auditTechnical } = require("./technical.audit");
const { calculateOverallScore } = require("./score.audit");


const runAudit = (crawlData) => {

    const homepage =
        crawlData.homepage;


    const allProducts =
        crawlData.products?.items || [];


    /*
     * CRITICAL:
     *
     * Only successfully crawled products are allowed
     * into the deterministic audit.
     *
     * Failed/network-error products are NOT findings.
     */

    const products =
        allProducts.filter(
            (product) =>
                product?.success === true &&
                product?.crawlStatus === "completed"
        );


    // const discoveredPages = crawlData.discoveredPages || {};


    const seoAudit =
        auditSEO(
            homepage
        );


    const productAudit =
        auditProducts(
            products
        );


    const conversionAudit =
        auditConversion(
            homepage,
            products
        );


    const uxAudit =
        auditUX(
            homepage
        );


    const technicalAudit =
        auditTechnical(
            crawlData
        );


    const score =
        calculateOverallScore({
            seo:
                seoAudit,

            products:
                productAudit,

            conversion:
                conversionAudit,

            ux:
                uxAudit,

            technical:
                technicalAudit
        });


    return {

        score,

        seo:
            seoAudit,

        products:
            productAudit,

        conversion:
            conversionAudit,

        ux:
            uxAudit,

        technical:
            technicalAudit,

        /*
         * Keep crawl quality information separate
         * from actual audit findings.
         */

        crawlQuality: {

            productsRequested:
                allProducts.length,

            productsSuccessfullyAnalyzed:
                products.length,

            productsFailed:
                allProducts.filter(
                    (product) =>
                        product?.success !== true ||
                        product?.crawlStatus !==
                            "completed"
                ).length
        }
    };
};


module.exports = {
    runAudit
};