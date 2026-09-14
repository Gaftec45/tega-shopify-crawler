const {
    crawlProductPage
} = require("../services/crawler/product.crawler");

const crawlProduct = async (req, res) => {
    try {
        const { productUrl } = req.body;

        if (!productUrl) {
            return res.status(400).json({
                success: false,
                message: "productUrl is required"
            });
        }

        let url;

        try {
            url = new URL(productUrl);
        } catch {
            return res.status(400).json({
                success: false,
                message: "Invalid URL"
            });
        }

        if (!["http:", "https:"].includes(url.protocol)) {
            return res.status(400).json({
                success: false,
                message: "Only HTTP and HTTPS URLs are allowed"
            });
        }

        const result = await crawlProductPage(
            url.toString()
        );

        if (!result.success) {
            return res.status(502).json(result);
        }

        return res.status(200).json(result);

    } catch (error) {
        console.error(
            "Product crawler controller error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to crawl product"
        });
    }
};

module.exports = {
    crawlProduct
};