
const jwt = require("jsonwebtoken");
const axios = require("axios");

const MAIN_API_URL = process.env.MAIN_API_URL;
const INTERNAL_API_KEY = process.env.TEGASCOUT_INTERNAL_API_KEY;

const auth = async (req, res, next) => {
    const header = req.headers.authorization;

    if (!header?.startsWith("Bearer ")) {
        return res.status(401).json({
            success: false,
            message: "Not authorized"
        });
    }

    if (!MAIN_API_URL || !INTERNAL_API_KEY) {
        console.error("Main API authentication configuration missing");

        return res.status(503).json({
            success: false,
            message: "Authentication service unavailable"
        });
    }

    try {
        const token = header.split(" ")[1];

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        if (!decoded.id) {
            return res.status(401).json({
                success: false,
                message: "Invalid token payload"
            });
        }

        const response = await axios.post(
            `${MAIN_API_URL.replace(/\/+$/, "")}/internal/auth/verify`,
            {
                userId: decoded.id
            },
            {
                headers: {
                    "x-internal-api-key": INTERNAL_API_KEY
                },
                timeout: 10000
            }
        );

        if (!response.data?.success || !response.data?.user?.id) {
            return res.status(401).json({
                success: false,
                message: "User verification failed"
            });
        }

        req.user = {
            id: response.data.user.id,
            productMode: response.data.user.productMode,
            role: response.data.user.role
        };

        next();

    } catch (error) {
        if (error.name === "JsonWebTokenError" ||
            error.name === "TokenExpiredError") {
            return res.status(401).json({
                success: false,
                message: "Invalid or expired token"
            });
        }

        const upstreamStatus = error.response?.status;

        console.log("MAIN BACKEND AUTH RESPONSE:", {
    status: upstreamStatus,
    data: error.response?.data,
    url: error.config?.url
});

        if (upstreamStatus === 403 || upstreamStatus === 404) {
            return res.status(403).json({
                success: false,
                message: "Your account is not active"
            });
        }

        console.error(
            "Authentication verification failed:",
            error.response?.data || error.message
        );

        return res.status(503).json({
            success: false,
            message: "Could not verify your account. Please try again."
        });
    }
};

module.exports = auth;