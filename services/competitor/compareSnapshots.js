const normalizeUrl = (url) => {
    try {
        const parsed = new URL(url);
        parsed.hash = "";
        parsed.search = "";
        return parsed.href.replace(/\/$/, "").toLowerCase();
    } catch {
        return String(url || "").trim().toLowerCase();
    }
};

const compareSnapshots = (previousSnapshot, currentSnapshot) => {
    const previousProducts = previousSnapshot?.products || [];
    const currentProducts = currentSnapshot?.products || [];

    const getProductKey = (product) =>
        normalizeUrl(product.productUrl);

    const previousMap = new Map(
        previousProducts.map((product) => [
            getProductKey(product),
            product,
        ])
    );

    const currentMap = new Map(
        currentProducts.map((product) => [
            getProductKey(product),
            product,
        ])
    );

    const newProducts = [];
    const removedProducts = [];
    const priceChanges = [];
    const unchangedProducts = [];

    for (const [key, currentProduct] of currentMap) {
        const previousProduct = previousMap.get(key);

        if (!previousProduct) {
            newProducts.push(currentProduct);
            continue;
        }

        const oldPrice = previousProduct.price;
        const newPrice = currentProduct.price;

        const oldCurrency = previousProduct.currency || null;
        const newCurrency = currentProduct.currency || null;

        // Only compare prices when both are valid numbers
        // and use the same currency.
        if (
            typeof oldPrice === "number" &&
            Number.isFinite(oldPrice) &&
            typeof newPrice === "number" &&
            Number.isFinite(newPrice) &&
            oldCurrency === newCurrency
        ) {
            if (oldPrice !== newPrice) {
                const difference = newPrice - oldPrice;

                priceChanges.push({
                    productUrl: currentProduct.productUrl,
                    title: currentProduct.title,
                    previousPrice: oldPrice,
                    currentPrice: newPrice,
                    currency: newCurrency,
                    difference,
                    changePercent:
                        oldPrice !== 0
                            ? Number(
                                  ((difference / oldPrice) * 100).toFixed(2)
                              )
                            : null,
                    direction:
                        difference > 0 ? "increased" : "decreased",
                });
            } else {
                unchangedProducts.push(currentProduct);
            }
        }
    }

    for (const [key, previousProduct] of previousMap) {
        if (!currentMap.has(key)) {
            removedProducts.push(previousProduct);
        }
    }

    return {
        previousScanAt: previousSnapshot?.scannedAt || null,
        currentScanAt: currentSnapshot?.scannedAt || null,
        summary: {
            previousProductCount: previousProducts.length,
            currentProductCount: currentProducts.length,
            newProducts: newProducts.length,
            removedProducts: removedProducts.length,
            priceChanges: priceChanges.length,
            unchangedProducts: unchangedProducts.length,
        },
        newProducts,
        removedProducts,
        priceChanges,
        unchangedProducts,
    };
};

module.exports = { compareSnapshots };