const mongoose = require("mongoose");
const Audit = require("../models/audit.model");


const getUserAudits1 = async (req, res) => {
    try {
            const audits = await Audit.find({
                user: {
                    $exists: true,
                    $eq: req.user.id
                }
            })
            .select(
                "storeUrl requestedUrl finalUrl storeName status score productsFound progress currentStep error createdAt updatedAt"
            )
            .sort({
                createdAt: -1
            })
            .limit(2);

        return res.status(200).json({
            success: true,
            count: audits.length,
            data: audits
        });

    } catch (error) {
        console.error("Get user audits error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve audits",
            error: error.message
        });
    }
};

const getUserAudits = async (req, res) => {
    try {
        const page = Math.max(
            parseInt(req.query.page) || 1,
            1
        );

        const limit = Math.min(
            Math.max(
                parseInt(req.query.limit) || 5,
                1
            ),
            50
        );

        const skip = (page - 1) * limit;

        const filter = {
            user: req.user.id
        };

        const [audits, total] = await Promise.all([
            Audit.find(filter)
                .select(
                    "user storeUrl requestedUrl finalUrl storeName status score productsFound progress currentStep error createdAt updatedAt"
                )
                .sort({
                    createdAt: -1
                })
                .skip(skip)
                .limit(limit),

            Audit.countDocuments(filter)
        ]);

        return res.status(200).json({
            success: true,
            count: audits.length,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            data: audits
        });

    } catch (error) {
        console.error(
            "Get user audits error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve audits",
            error: error.message
        });
    }
};

const getAuditById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid audit ID"
            });
        }

        const audit = await Audit.findOne({
            _id: id,
            user: req.user.id
        });

        if (!audit) {
            return res.status(404).json({
                success: false,
                message: "Audit not found"
            });
        }

        return res.status(200).json({
            success: true,
            data: audit
        });

    } catch (error) {
        console.error(
            "Get audit error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve audit",
            error: error.message
        });
    }
};


const getAuditReport = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid audit ID"
            });
        }

        const audit = await Audit.findOne({
            _id: id,
            user: req.user.id
        });

        if (!audit) {
            return res.status(404).json({
                success: false,
                message: "Audit not found"
            });
        }

        return res.status(200).json({
            success: true,

            data: {
                id: audit._id,

                storeUrl: audit.storeUrl,

                requestedUrl: audit.requestedUrl,

                finalUrl: audit.finalUrl,

                storeName: audit.storeName,

                status: audit.status,

                score: audit.score,

                aiAudit: audit.aiAudit,

                createdAt: audit.createdAt,

                updatedAt: audit.updatedAt
            }
        });

    } catch (error) {
        console.error(
            "Get audit report error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve audit report",
            error: error.message
        });
    }
};

const analyzeAudit = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid audit ID"
            });
        }

        const audit = await Audit.findOne({
            _id: id,
            user: req.user.id
        });

        if (!audit) {
            return res.status(404).json({
                success: false,
                message: "Audit not found"
            });
        }

        // Make sure crawling/deterministic analysis is complete
        if (!audit.crawl || !audit.deterministicAudit) {
            return res.status(400).json({
                success: false,
                message:
                    "Audit must be crawled and analyzed before AI analysis"
            });
        }

        // Prevent duplicate AI processing
        if (audit.status === "ai_processing") {
            return res.status(409).json({
                success: false,
                message: "AI analysis is already in progress"
            });
        }

        // If AI already completed, don't run it again accidentally
        if (
            audit.status === "completed" &&
            audit.aiAudit
        ) {
            return res.status(200).json({
                success: true,
                message: "AI analysis already completed",
                data: {
                    auditId: audit._id,
                    status: audit.status,
                    aiAudit: audit.aiAudit
                }
            });
        }

        audit.status = "ai_processing";
        audit.progress = 10;
        audit.currentStep = "building_ai_payload";
        audit.error = null;

        await audit.save();

        // --------------------------------
        // BUILD AI PAYLOAD
        // --------------------------------

        const {
            buildAiAuditPayload
        } = require("../services/ai/audit.payload");

        const {
            buildAuditPrompt
        } = require("../services/ai/audit.prompt");

        const {
            analyzeWithOpenRouter
        } = require("../services/ai/openrouter.service");


        const aiPayload =
            buildAiAuditPayload(
                audit.crawl,
                audit.deterministicAudit
            );


        audit.progress = 30;
        audit.currentStep = "building_ai_prompt";

        await audit.save();


        // --------------------------------
        // BUILD PROMPT
        // --------------------------------

        const {
            systemPrompt,
            userPrompt
        } = buildAuditPrompt(
            aiPayload
        );


        audit.progress = 50;
        audit.currentStep = "ai_processing";

        await audit.save();


        console.log(
            `Sending audit to OpenRouter: ${audit._id}`
        );


        // --------------------------------
        // OPENROUTER
        // --------------------------------

        const aiAudit =
            await analyzeWithOpenRouter({
                systemPrompt,
                userPrompt
            });


        // --------------------------------
        // SAVE AI RESULT
        // --------------------------------

        audit.aiAudit =
            aiAudit;

        audit.status =
            "completed";

        audit.progress =
            100;

        audit.currentStep =
            "completed";

        audit.error =
            null;


        await audit.save();


        console.log(
            `AI analysis completed: ${audit._id}`
        );


        return res.status(200).json({
            success: true,

            message:
                "AI analysis completed successfully",

            data: {
                auditId: audit._id,
                status: audit.status,
                score: audit.score,
                aiAudit: audit.aiAudit
            }
        });


    } catch (error) {

        console.error(
            "AI analysis error:",
            error
        );


        // Preserve the crawl and deterministic audit.
        // Only mark the AI stage as failed.
        try {

            const { id } = req.params;

            if (
                mongoose.Types.ObjectId.isValid(id)
            ) {

                await Audit.findByIdAndUpdate(
                    id,
                    {
                        status: "crawled",
                        currentStep: "ai_failed",
                        error: error.message
                    }
                );

            }

        } catch (saveError) {

            console.error(
                "Failed to save AI error:",
                saveError
            );

        }


        return res.status(500).json({
            success: false,

            message:
                "AI analysis failed",

            error:
                error.message
        });
    }
};

module.exports = {
    getAuditById,
    getAuditReport,
    analyzeAudit,
    getUserAudits
};