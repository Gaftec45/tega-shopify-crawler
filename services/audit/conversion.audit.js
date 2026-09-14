const auditConversion = (homepage, products = []) => {
    const issues = [];
    const strengths = [];

    const homepageSignals =
        homepage?.signals || {};

    // -----------------------------
    // EMAIL CAPTURE
    // -----------------------------

    if (homepageSignals.hasEmailCapture === true) {
        strengths.push(
            "Email capture is available on the homepage."
        );
    } else {
        issues.push({
            category: "Conversion",
            severity: "medium",
            issue: "No email capture detected",
            evidence:
                "The crawled homepage does not contain a detectable email signup field."
        });
    }

    // -----------------------------
    // CONTACT FORM
    // -----------------------------

    if (homepageSignals.hasContactForm === true) {
        strengths.push(
            "A contact form is available on the homepage."
        );
    } else {
        issues.push({
            category: "Conversion",
            severity: "low",
            issue: "No contact form detected on homepage",
            evidence:
                "No detectable contact form was found in the crawled homepage."
        });
    }

    // -----------------------------
    // PRODUCT PURCHASE PATH
    // -----------------------------

    if (products.length > 0) {
        const productsWithPurchasePath =
            products.filter((product) => {
                const conversion =
                    product.conversion || {};

                const signals =
                    product.signals || {};

                return (
                    signals.hasAddToCart === true ||
                    signals.hasProductForm === true ||
                    signals.hasBuyNow === true ||
                    conversion.hasAddToCart === true ||
                    conversion.hasProductForm === true ||
                    conversion.hasBuyNow === true
                );
            });

        if (
            productsWithPurchasePath.length === products.length
        ) {
            strengths.push(
                `All ${products.length} sampled product pages show a detectable purchase path.`
            );
        } else if (
            productsWithPurchasePath.length > 0
        ) {
            strengths.push(
                `${productsWithPurchasePath.length} of ${products.length} sampled product pages show a detectable purchase path.`
            );
        } else {
            issues.push({
                category: "Conversion",
                severity: "high",
                issue: "No detectable purchase path across sampled products",
                evidence:
                    `None of the ${products.length} sampled product pages showed a detectable add-to-cart action, product form, or buy-now action.`
            });
        }
    }

    // -----------------------------
    // REVIEWS
    // -----------------------------

    if (products.length > 0) {
        const productsWithReviews =
            products.filter(
                (product) =>
                    product.conversion?.hasReviews === true
            );

        if (productsWithReviews.length === 0) {
            issues.push({
                category: "Conversion",
                severity: "medium",
                issue: "No customer reviews detected across sampled products",
                evidence:
                    `None of the ${products.length} sampled product pages showed detectable review or rating content.`
            });
        } else {
            strengths.push(
                `${productsWithReviews.length} of ${products.length} sampled products show review-related content.`
            );
        }
    }

    // -----------------------------
    // SHIPPING
    // -----------------------------

    if (products.length > 0) {
        const productsWithShipping =
            products.filter(
                (product) =>
                    product.conversion?.hasShippingInfo === true
            );

        if (
            productsWithShipping.length === products.length
        ) {
            strengths.push(
                "Shipping information is detectable across all sampled product pages."
            );
        } else if (
            productsWithShipping.length > 0
        ) {
            strengths.push(
                `${productsWithShipping.length} of ${products.length} sampled product pages show detectable shipping information.`
            );
        } else {
            issues.push({
                category: "Conversion",
                severity: "medium",
                issue: "Shipping information not detected across sampled products",
                evidence:
                    `No detectable shipping information was found on the ${products.length} sampled product pages.`
            });
        }
    }

    // -----------------------------
    // RETURNS
    // -----------------------------

    if (products.length > 0) {
        const productsWithReturns =
            products.filter(
                (product) =>
                    product.conversion?.hasReturnInfo === true
            );

        if (
            productsWithReturns.length === products.length
        ) {
            strengths.push(
                "Return information is detectable across all sampled product pages."
            );
        } else if (
            productsWithReturns.length > 0
        ) {
            strengths.push(
                `${productsWithReturns.length} of ${products.length} sampled product pages show detectable return information.`
            );
        } else {
            issues.push({
                category: "Conversion",
                severity: "medium",
                issue: "Return information not detected across sampled products",
                evidence:
                    `No detectable return or refund information was found on the ${products.length} sampled product pages.`
            });
        }
    }

    return {
        category: "Conversion",
        issues,
        strengths
    };
};

module.exports = {
    auditConversion
};