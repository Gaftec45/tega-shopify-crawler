const healthCheck = (req, res) => {
    res.status(200).json({
        success: true,
        message: "AI Shopify Auditor API is running",
        timestamp: new Date().toISOString()
    });
};

module.exports = {
    healthCheck
};