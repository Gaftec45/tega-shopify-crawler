const internalDashboardAuth = (req, res, next) => {
    const expectedKey = process.env.TEGASCOUT_INTERNAL_API_KEY;
    const providedKey = req.headers["x-internal-api-key"];

    if (!expectedKey) {
        return res.status(500).json({
            success: false,
            message: "Internal API key is not configured."
        });
    }

    if (!providedKey || providedKey !== expectedKey) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized internal request."
        });
    }

    next();
};

module.exports = internalDashboardAuth;