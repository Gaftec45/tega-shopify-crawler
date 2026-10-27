
const Audit = require("../models/audit.model");

const {
    processAudit
} = require("../services/audit/audit.processor");

const {
    validateStoreUrl
} = require("../utils/url.security");

const createAuditForMode = async (req, res, productMode) => {
    try {
        const { storeUrl } = req.body;

        // Validate required URL
        if (!storeUrl) {
            return res.status(400).json({
                success: false,
                message: "storeUrl is required"
            });
        }

        // Validate URL security
        const validation = await validateStoreUrl(storeUrl);

        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: validation.message
            });
        }

        const url = validation.url;

        // Create audit with the correct product mode
        const audit = await Audit.create({
            user: req.user.id,
            productMode,
            storeUrl: url.toString(),
            requestedUrl: url.toString(),
            status: "pending",
            progress: 0,
            currentStep: "queued"
        });

        console.log(
            `Audit created: ${audit._id} | Product: ${productMode}`
        );

        // Start background processing
        processAudit(audit._id).catch((error) => {
            console.error("Background audit error:", error);
        });

        // Return immediately
        return res.status(202).json({
            success: true,
            message: "Audit started successfully",
            auditId: audit._id,
            status: audit.status,
            progress: audit.progress,
            currentStep: audit.currentStep
        });
    } catch (error) {
        console.error("Create audit error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to start audit",
            error: error.message
        });
    }
};

// Main TegaScout — existing credit-based flow
const createAudit = (req, res) => {
    return createAuditForMode(req, res, "main");
};

// TegaScout Intelligence — separate no-credit flow
const createIntelAudit = (req, res) => {
    return createAuditForMode(req, res, "intel");
};

module.exports = {
    createAudit,
    createIntelAudit
};
