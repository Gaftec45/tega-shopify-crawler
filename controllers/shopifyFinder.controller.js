
const mongoose = require("mongoose");

const ShopifyLead = require("../models/ShopifyLead");
const ShopifyDiscoveryRun = require("../models/ShopifyDiscoveryRun");

const {
    startDiscovery,
    refreshDiscovery,
    getDiscovery
} = require("../services/shopifyFinder/discovery.service");


const getUserId = (req) => {
    return req.user?.id || req.user?._id;
};


const sendError = (res, error) => {
    const responseData = error.response?.data || {};

    const statusCode =
        error.response?.status ||
        error.statusCode ||
        (
            error.code === "INSUFFICIENT_CREDITS" ? 402 :
            error.code === "RESERVATION_CONFLICT" ? 409 :
            error.message === "Discovery run not found" ? 404 :
            500
        );

    return res.status(statusCode).json({
        success: false,
        code: responseData.code || error.code || "SHOPIFY_FINDER_ERROR",
        message:
            responseData.message ||
            error.message ||
            "An unexpected error occurred",
        ...(responseData.availableCredits !== undefined && {
            availableCredits: responseData.availableCredits
        }),
        ...(responseData.requiredCredits !== undefined && {
            requiredCredits: responseData.requiredCredits
        }),
        ...(error.availableCredits !== undefined && {
            availableCredits: error.availableCredits
        }),
        ...(error.requiredCredits !== undefined && {
            requiredCredits: error.requiredCredits
        })
    });
};


// ==========================================
// START SHOPIFY DISCOVERY
// POST /discoveries
// ==========================================

const startShopifyDiscovery = async (req, res) => {
    try {
        const userId = getUserId(req);

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required"
            });
        }

        const {
            query,
            country = "US",
            maxItems = 50
        } = req.body;

        if (!query || typeof query !== "string" || !query.trim()) {
            return res.status(400).json({
                success: false,
                message: "A valid search query is required"
            });
        }

        const parsedMaxItems = Number(maxItems);

        if (
            !Number.isInteger(parsedMaxItems) ||
            parsedMaxItems < 1 ||
            parsedMaxItems > 1000
        ) {
            return res.status(400).json({
                success: false,
                message: "maxItems must be a whole number between 1 and 1000"
            });
        }

        const discovery = await startDiscovery({
            userId,
            query: query.trim(),
            country,
            maxItems: parsedMaxItems
        });

        return res.status(201).json({
            success: true,
            message: "Shopify discovery started",
            data: discovery
        });

    } catch (error) {
        console.error(
            "START SHOPIFY DISCOVERY ERROR:",
            error.response?.data || error.message
        );

        return sendError(res, error);
    }
};


// ==========================================
// REFRESH SHOPIFY DISCOVERY
// POST /discoveries/:discoveryId/refresh
// ==========================================

const refreshShopifyDiscovery = async (req, res) => {
    try {
        const userId = getUserId(req);
        const { discoveryId } = req.params;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required"
            });
        }

        if (!mongoose.Types.ObjectId.isValid(discoveryId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid discovery ID"
            });
        }

        const discovery = await refreshDiscovery({
            discoveryId,
            userId
        });

        return res.json({
            success: true,
            message: "Discovery status retrieved",
            data: discovery
        });

    } catch (error) {
        console.error(
            "REFRESH SHOPIFY DISCOVERY ERROR:",
            error.response?.data || error.message
        );

        if (error.message === "Discovery run not found") {
            return res.status(404).json({
                success: false,
                message: "Discovery run not found"
            });
        }

        return sendError(res, error);
    }
};


// ==========================================
// GET SINGLE SHOPIFY DISCOVERY
// GET /discoveries/:discoveryId
// ==========================================

const getShopifyDiscovery = async (req, res) => {
    try {
        const userId = getUserId(req);
        const { discoveryId } = req.params;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required"
            });
        }

        if (!mongoose.Types.ObjectId.isValid(discoveryId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid discovery ID"
            });
        }

        const discovery = await getDiscovery({
            discoveryId,
            userId
        });

        if (!discovery) {
            return res.status(404).json({
                success: false,
                message: "Discovery run not found"
            });
        }

        return res.json({
            success: true,
            data: discovery
        });

    } catch (error) {
        console.error(
            "GET SHOPIFY DISCOVERY ERROR:",
            error.message
        );

        return sendError(res, error);
    }
};


// ==========================================
// GET SHOPIFY LEADS
// GET /leads
// ==========================================

const getShopifyLeads = async (req, res) => {
    try {
        const userId = getUserId(req);

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required"
            });
        }

        const {
            qualification,
            auditStatus,
            country,
            search,
            page = 1,
            limit = 50
        } = req.query;

        const parsedPage = Math.max(1, Number(page) || 1);
        const parsedLimit = Math.min(
            100,
            Math.max(1, Number(limit) || 50)
        );

        const filter = {
            user: userId
        };

        if (qualification) {
            filter.qualification = qualification;
        }

        if (auditStatus) {
            filter.auditStatus = auditStatus;
        }

        if (country) {
            filter.country = String(country).toUpperCase();
        }

        if (search && String(search).trim()) {
            const escapedSearch = String(search)
                .trim()
                .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

            const regex = new RegExp(escapedSearch, "i");

            filter.$or = [
                { storeName: regex },
                { domain: regex },
                { category: regex },
                { emails: { $elemMatch: { email: regex } } },
                { phones: regex }
            ];
        }

        const skip = (parsedPage - 1) * parsedLimit;

        const [leads, total] = await Promise.all([
            ShopifyLead.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parsedLimit)
                .lean(),

            ShopifyLead.countDocuments(filter)
        ]);

        return res.json({
            success: true,
            leads,
            pagination: {
                total,
                page: parsedPage,
                limit: parsedLimit,
                totalPages: Math.ceil(total / parsedLimit),
                hasNextPage: parsedPage * parsedLimit < total,
                hasPreviousPage: parsedPage > 1
            }
        });

    } catch (error) {
        console.error(
            "GET SHOPIFY LEADS ERROR:",
            error.message
        );

        return sendError(res, error);
    }
};


module.exports = {
    startShopifyDiscovery,
    refreshShopifyDiscovery,
    getShopifyDiscovery,
    getShopifyLeads
};