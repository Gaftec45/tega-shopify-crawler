const auditProducts = (products = []) => {
    const issues = [];
    const strengths = [];

    if (products.length === 0) {
        issues.push({
            category: "Product",
            severity: "high",
            issue: "No product pages were successfully analyzed",
            evidence: "The crawler did not return any product data."
        });

        return {
            category: "Product",
            productsAnalyzed: 0,
            issues,
            strengths
        };
    }

    products.forEach((product) => {
        const productName =
            product.title || "Unnamed product";

const descriptionLength =
    product.description?.length ||
    product.description?.text?.length ||
    0;

        const imagesTotal =
            product.images?.total || 0;

        const imagesWithoutAlt =
            product.images?.withoutAlt || 0;

        const conversion =
            product.conversion || {};

        const signals =
            product.signals || {};

        const structuredData =
            product.structuredData || {};

        const shopify =
            product.shopify || {};

        const availability =
            shopify.availability || {};

        const pricing =
            shopify.pricing || {};

        // -----------------------------
        // PRODUCT TITLE
        // -----------------------------

        if (!product.title) {
            issues.push({
                category: "Product",
                severity: "high",
                issue: "Product title is missing",
                evidence: product.url
            });
        } else {
            strengths.push(
                `${productName} has a product title.`
            );
        }

        // -----------------------------
        // DESCRIPTION
        // -----------------------------

        if (descriptionLength === 0) {
            issues.push({
                category: "Product",
                severity: "high",
                issue: "Product description is missing",
                evidence:
                    `${productName} has no detected product description.`
            });
        } else if (descriptionLength < 200) {
            issues.push({
                category: "Product",
                severity: "medium",
                issue: "Product description is short",
                evidence:
                    `${productName} has a ${descriptionLength}-character description.`
            });
        } else {
            strengths.push(
                `${productName} has a detailed product description.`
            );
        }

        // -----------------------------
        // IMAGE ALT TEXT
        // -----------------------------

        if (
            imagesTotal > 0 &&
            imagesWithoutAlt > 0
        ) {
            const missingAltPercentage =
                (imagesWithoutAlt / imagesTotal) * 100;

            let severity = "low";

            if (missingAltPercentage > 30) {
                severity = "high";
            } else if (missingAltPercentage > 10) {
                severity = "medium";
            }

            issues.push({
                category: "Product",
                severity,
                issue: "Product images are missing alt text",
                evidence:
                    `${productName}: ${imagesWithoutAlt} of ${imagesTotal} images have no alt text (${missingAltPercentage.toFixed(1)}%).`
            });
        } else if (
            imagesTotal > 0 &&
            imagesWithoutAlt === 0
        ) {
            strengths.push(
                `${productName} images have detectable alt text.`
            );
        }

        // -----------------------------
        // ADD TO CART / PURCHASE CTA
        // -----------------------------

        const hasAddToCart =
            signals.hasAddToCart === true ||
            conversion.hasAddToCart === true;

        const hasProductForm =
            signals.hasProductForm === true ||
            conversion.hasProductForm === true;

        const hasBuyNow =
            signals.hasBuyNow === true ||
            conversion.hasBuyNow === true;

        const hasPurchasePath =
            hasAddToCart ||
            hasProductForm ||
            hasBuyNow;

        if (!hasPurchasePath) {
            issues.push({
                category: "Conversion",
                severity: "high",
                issue: "Purchase action not detected on product page",
                evidence:
                    `${productName} does not have a detectable add-to-cart action, product form, or buy-now action in the crawled page data.`
            });
        } else {
            strengths.push(
                `${productName} has a detectable purchase path.`
            );
        }

        // -----------------------------
        // REVIEWS
        // -----------------------------

        if (conversion.hasReviews === true) {
            strengths.push(
                `${productName} displays detectable review-related content.`
            );
        }

        // -----------------------------
        // SHIPPING
        // -----------------------------

        if (conversion.hasShippingInfo === true) {
            strengths.push(
                `${productName} has detectable shipping information.`
            );
        } else {
            issues.push({
                category: "Conversion",
                severity: "medium",
                issue: "Shipping information not detected on product page",
                evidence:
                    `${productName} has no detectable shipping information in the crawled product-page content.`
            });
        }

        // -----------------------------
        // RETURNS
        // -----------------------------

        if (conversion.hasReturnInfo === true) {
            strengths.push(
                `${productName} has detectable return information.`
            );
        } else {
            issues.push({
                category: "Conversion",
                severity: "medium",
                issue: "Return information not detected on product page",
                evidence:
                    `${productName} has no detectable return or refund information in the crawled product-page content.`
            });
        }

        // -----------------------------
        // SHOPIFY AVAILABILITY
        // -----------------------------

        if (
            availability.totalVariants > 0 &&
            availability.availableVariants === 0
        ) {
            issues.push({
                category: "Product",
                severity: "high",
                issue: "Product appears unavailable",
                evidence:
                    `${productName} has ${availability.totalVariants} Shopify variant(s), but none are currently available according to the crawled Shopify product data.`
            });
        } else if (
            availability.availableVariants > 0
        ) {
            strengths.push(
                `${productName} has available Shopify variants.`
            );
        }

        // -----------------------------
        // SHOPIFY PRICING
        // -----------------------------

        if (
            pricing.lowest === null ||
            pricing.lowest === undefined
        ) {
            issues.push({
                category: "Product",
                severity: "high",
                issue: "Product price was not detected",
                evidence:
                    `${productName} does not have a detectable Shopify variant price.`
            });
        } else {
            strengths.push(
                `${productName} has detectable pricing.`
            );
        }

        // -----------------------------
        // PRODUCT STRUCTURED DATA
        // -----------------------------

        if (!structuredData.hasProductSchema) {
            issues.push({
                category: "SEO",
                severity: "high",
                issue: "Product structured data is missing",
                evidence:
                    `${productName} does not contain detectable Product JSON-LD in the crawled page.`
            });
        } else {
            strengths.push(
                `${productName} has Product structured data.`
            );
        }
    });

    return {
        category: "Product",
        productsAnalyzed: products.length,
        issues,
        strengths
    };
};

module.exports = {
    auditProducts
};