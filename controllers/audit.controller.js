const axios = require("axios");
const mongoose = require("mongoose");
const crypto = require("crypto");
const Audit = require("../models/audit.model");
const { getIntelSettings } = require("../services/main/intelSettingsService");

const {
    reserveAuditCredits,
    commitAuditCredits,
    releaseAuditCredits,
    checkIntelAnalysisQuota,
} = require("../services/main/mainApiService");

const MAIN_AUDIT_COST = 8;
const INTEL_MODE = "intel";

// ========================================
// HELPERS
// ========================================

const isIntelAudit = (audit) =>
    audit.productMode === INTEL_MODE;

const isAuditUnlocked = (audit) => {
    // Intel users do not need to unlock audits with regular credits.
    if (isIntelAudit(audit)) {
        return true;
    }

    return audit.isUnlocked === true;
};

const safeContact = (audit, unlocked) => ({
    totalEmails: Number(audit.contact?.totalEmails || 0),
    emails: unlocked ? audit.contact?.emails || [] : [],
    primaryEmail: unlocked
        ? audit.contact?.primaryEmail || null
        : null,
    pagesCrawled: unlocked ? audit.contact?.pagesCrawled || [] : []
});

// ========================================
// GET USER AUDITS
// GET /api/audits/user
// ========================================

const getUserAudits = async (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(
            Math.max(parseInt(req.query.limit, 10) || 5, 1),
            50
        );
        const skip = (page - 1) * limit;
        const filter = { user: req.user.id };

        const [audits, total] = await Promise.all([
            Audit.find(filter)
                .select(
                    "_id user productMode storeUrl requestedUrl finalUrl storeName status score productsFound progress currentStep progressMessage error isUnlocked createdAt updatedAt contact"
                )
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Audit.countDocuments(filter)
        ]);

        const data = audits.map((audit) => {
            const unlocked = isAuditUnlocked(audit);

            return {
                _id: audit._id,
                productMode: audit.productMode || "main",
                storeUrl: audit.storeUrl,
                requestedUrl: audit.requestedUrl,
                finalUrl: audit.finalUrl,
                storeName: audit.storeName,
                status: audit.status,
                score: audit.score,
                productsFound: audit.productsFound,
                progress: audit.progress,
                currentStep: audit.currentStep,
                progressMessage: audit.progressMessage,
                error: audit.error,
                isUnlocked: unlocked,
                contact: safeContact(audit, unlocked),
                createdAt: audit.createdAt,
                updatedAt: audit.updatedAt
            };
        });

        return res.status(200).json({
            success: true,
            count: data.length,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            data
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

// ========================================
// GET SINGLE AUDIT
// GET /api/audits/:id
// ========================================

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
        }).lean();

        if (!audit) {
            return res.status(404).json({
                success: false,
                message: "Audit not found"
            });
        }

        const unlocked = isAuditUnlocked(audit);

        const data = {
            _id: audit._id,
            productMode: audit.productMode || "main",
            storeUrl: audit.storeUrl,
            requestedUrl: audit.requestedUrl,
            finalUrl: audit.finalUrl,
            storeName: audit.storeName,
            status: audit.status,
            progress: audit.progress,
            currentStep: audit.currentStep,
            progressMessage: audit.progressMessage,
            productsFound: audit.productsFound,
            score: audit.score,
            createdAt: audit.createdAt,
            updatedAt: audit.updatedAt,
            isUnlocked: unlocked,
            contact: safeContact(audit, unlocked)
        };

        if (unlocked) {
            data.deterministicAudit = audit.deterministicAudit || null;
            data.aiAudit = audit.aiAudit || null;
            data.crawl = audit.crawl || null;
        }

        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error("Get audit error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve audit",
            error: error.message
        });
    }
};

// ========================================
// GET AUDIT REPORT
// GET /api/audits/:id/report
// ========================================

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
        }).lean();

        if (!audit) {
            return res.status(404).json({
                success: false,
                message: "Audit not found"
            });
        }

        const unlocked = isAuditUnlocked(audit);

        const data = {
            id: audit._id,
            productMode: audit.productMode || "main",
            storeUrl: audit.storeUrl,
            requestedUrl: audit.requestedUrl,
            finalUrl: audit.finalUrl,
            storeName: audit.storeName,
            status: audit.status,
            score: audit.score,
            isUnlocked: unlocked,
            contact: safeContact(audit, unlocked),
            createdAt: audit.createdAt,
            updatedAt: audit.updatedAt
        };

        if (unlocked) {
            data.deterministicAudit = audit.deterministicAudit || null;
            data.aiAudit = audit.aiAudit || null;
            data.crawl = audit.crawl || null;
        }

        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error("Get audit report error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve audit report",
            error: error.message
        });
    }
};


// ========================================
// ANALYZE AUDIT
// Main: charge 8 credits.
// Intelligence: no credits; enforce monthly AI quota.
// ========================================


const analyzeAudit = async (req, res) => {
    let reservationId = null;
    let aiSucceeded = false;
    let audit = null;
    let intelMode = false;

    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid audit ID"
            });
        }

        const existingAudit = await Audit.findOne({
            _id: id,
            user: req.user.id
        });

        if (!existingAudit) {
            return res.status(404).json({
                success: false,
                message: "Audit not found"
            });
        }

        intelMode = isIntelAudit(existingAudit);

        if (intelMode) {
            existingAudit.isUnlocked = true;
            existingAudit.creditStatus = "not_required";
            existingAudit.creditReservationId = null;
            await existingAudit.save();
        }

        // Return an existing completed report without charging again.
        if (
            existingAudit.status === "completed" &&
            existingAudit.aiAudit &&
            (intelMode || existingAudit.isUnlocked === true)
        ) {
            return res.status(200).json({
                success: true,
                message: intelMode
                    ? "Intelligence analysis already completed"
                    : "Full audit already unlocked",
                data: {
                    auditId: existingAudit._id,
                    status: existingAudit.status,
                    progress: existingAudit.progress,
                    currentStep: existingAudit.currentStep,
                    progressMessage: existingAudit.progressMessage,
                    score: existingAudit.score,
                    isUnlocked: true,
                    aiAudit: existingAudit.aiAudit,
                    ...(intelMode
                        ? {}
                        : { creditsUsed: MAIN_AUDIT_COST })
                }
            });
        }

        if (
            !intelMode &&
            existingAudit.creditStatus === "commit_pending" &&
            existingAudit.aiAudit
        ) {
            return res.status(409).json({
                success: false,
                message:
                    "AI analysis completed, but credit finalization is pending. Please try again shortly."
            });
        }

        if (
            !existingAudit.crawl ||
            !existingAudit.deterministicAudit
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Audit must be crawled and analyzed before AI analysis"
            });
        }

        // Recover stale processing attempts.
        if (existingAudit.status === "ai_processing") {
            const startedAt = existingAudit.aiProcessingStartedAt;

            const elapsed = startedAt
                ? Date.now() - new Date(startedAt).getTime()
                : 0;

            const MAX_PROCESSING_TIME = 10 * 60 * 1000;

            if (startedAt && elapsed < MAX_PROCESSING_TIME) {
                return res.status(409).json({
                    success: false,
                    message: "AI analysis is already in progress"
                });
            }

            if (
                !intelMode &&
                existingAudit.creditReservationId &&
                existingAudit.creditStatus === "reserved"
            ) {
                try {
                    await releaseAuditCredits({
                        reservationId:
                            existingAudit.creditReservationId,
                        reason: "Stale AI analysis process recovered"
                    });
                } catch (releaseError) {
                    console.error(
                        "Failed to release stale reservation:",
                        releaseError
                    );

                    return res.status(500).json({
                        success: false,
                        message:
                            "The previous analysis is stuck and its credit reservation could not be released."
                    });
                }
            }

            existingAudit.status = "crawled";
            existingAudit.progress = 70;
            existingAudit.currentStep = "ready_for_ai";
            existingAudit.progressMessage =
                "Previous AI analysis stopped unexpectedly. You can try again.";
            existingAudit.aiProcessingStartedAt = null;
            existingAudit.error = null;
            existingAudit.isUnlocked = intelMode;
            existingAudit.creditReservationId = null;
            existingAudit.creditStatus = "not_required";

            await existingAudit.save();

            return res.status(409).json({
                success: false,
                message:
                    "The previous AI analysis timed out. Please try again."
            });
        }

        // Intel: verify subscription and monthly quota.
        // Do not run an Intel analysis if quota verification fails.
        if (intelMode) {
            let quota;

            try {
                quota = await checkIntelAnalysisQuota(
                    req.headers.authorization
                );
            } catch (quotaError) {
                console.error(
                    "Intel quota verification failed:",
                    quotaError.response?.data || quotaError.message
                );

                return res.status(503).json({
                    success: false,
                    code: "INTEL_QUOTA_CHECK_UNAVAILABLE",
                    message:
                        "We could not verify your Intel subscription usage. Please try again shortly."
                });
            }

            if (!quota.allowed) {
                const limitReached =
                    quota.used !== undefined &&
                    quota.limit !== undefined;

                return res.status(limitReached ? 429 : 403).json({
                    success: false,
                    code: limitReached
                        ? "INTEL_ANALYSIS_LIMIT_REACHED"
                        : "INTEL_SUBSCRIPTION_REQUIRED",
                    message: quota.reason,
                    usage: {
                        used: quota.used ?? null,
                        limit: quota.limit ?? null,
                        remaining: quota.remaining ?? null
                    }
                });
            }
        }

        // Atomically claim the audit to prevent duplicate processing.
        audit = await Audit.findOneAndUpdate(
            {
                _id: id,
                user: req.user.id,
                status: "crawled",
                $or: [
                    { aiAudit: { $exists: false } },
                    { aiAudit: null }
                ]
            },
            {
                $set: {
                    status: "ai_processing",
                    aiProcessingStartedAt: new Date(),
                    progress: 75,
                    currentStep: "building_ai_payload",
                    progressMessage: "Preparing audit data for AI...",
                    error: null
                }
            },
            { new: true }
        );

        if (!audit) {
            const latest = await Audit.findOne({
                _id: id,
                user: req.user.id
            });

            if (
                latest &&
                latest.status === "completed" &&
                latest.aiAudit &&
                (isIntelAudit(latest) || latest.isUnlocked === true)
            ) {
                const latestIntelMode = isIntelAudit(latest);

                return res.status(200).json({
                    success: true,
                    message: latestIntelMode
                        ? "Intelligence analysis already completed"
                        : "Full audit already unlocked",
                    data: {
                        auditId: latest._id,
                        status: latest.status,
                        progress: latest.progress,
                        currentStep: latest.currentStep,
                        progressMessage: latest.progressMessage,
                        score: latest.score,
                        isUnlocked: true,
                        aiAudit: latest.aiAudit,
                        ...(latestIntelMode
                            ? {}
                            : { creditsUsed: MAIN_AUDIT_COST })
                    }
                });
            }

            return res.status(409).json({
                success: false,
                message:
                    "Audit is already processing or is not available for analysis"
            });
        }

        intelMode = isIntelAudit(audit);

        // Reserve credits for Main audits only.
        if (!intelMode) {
            const reservation = await reserveAuditCredits({
                userId: req.user.id,
                amount: MAIN_AUDIT_COST,
                feature: "full_audit_unlock",
                reference: `audit-unlock-${audit._id}`,
                description: "Full Shopify audit unlock and AI analysis",
                metadata: {
                    auditId: audit._id.toString(),
                    auditUrl: audit.storeUrl || audit.url || null
                }
            });

            reservationId = reservation?.reservation?.id;

            if (!reservationId) {
                throw new Error(
                    "Credit reservation did not return a reservation ID"
                );
            }

            audit.creditReservationId = reservationId;
            audit.creditStatus = "reserved";
        } else {
            audit.creditReservationId = null;
            audit.creditStatus = "not_required";
        }

        audit.isUnlocked = intelMode;
        await audit.save();

        // Load AI services.
        const { buildAiAuditPayload } = require(
            "../services/ai/audit.payload"
        );

        const { buildAuditPrompt } = require(
            "../services/ai/audit.prompt"
        );

        const { analyzeWithOpenRouter } = require(
            "../services/ai/openrouter.service"
        );

        // Build the audit payload.
        const aiPayload = buildAiAuditPayload(
            audit.crawl,
            audit.deterministicAudit
        );

        audit.progress = 78;
        audit.currentStep = "building_ai_prompt";
        audit.progressMessage = "Preparing AI analysis...";
        await audit.save();

        // NEW: Load saved preferences for Intel audits only.
        let intelSettings = null;

        if (intelMode) {
            try {
                intelSettings = await getIntelSettings(
                    req.headers.authorization
                );
            } catch (settingsError) {
                console.error(
                    "Failed to load Intel settings; using default preferences:",
                    settingsError.response?.data || settingsError.message
                );
            }
        }

        // Main uses the original prompt behavior.
        // Intel applies the saved preferences in audit.prompt.js.
        const { systemPrompt, userPrompt } = intelMode
            ? buildAuditPrompt(aiPayload, intelSettings)
            : buildAuditPrompt(aiPayload);

        audit.progress = 80;
        audit.currentStep = "ai_processing";
        audit.progressMessage = "AI is analyzing your store...";
        await audit.save();

        // Run AI analysis.
        const aiAudit = await analyzeWithOpenRouter({
            systemPrompt,
            userPrompt
        });

        aiSucceeded = true;

        // Save AI output before finalizing Main credits.
        audit.aiAudit = aiAudit;
        audit.progress = 95;
        audit.currentStep = "analysis_completed";
        audit.progressMessage = intelMode
            ? "Intelligence analysis completed. Preparing your report..."
            : "AI analysis completed. Finalizing credits...";

        if (intelMode) {
            audit.creditStatus = "not_required";
            audit.creditReservationId = null;
            audit.isUnlocked = true;
        } else {
            audit.creditStatus = "commit_pending";
            audit.isUnlocked = false;
        }

        await audit.save();

        // Commit credits for Main audits only.
        if (!intelMode) {
            await commitAuditCredits({ reservationId });

            audit.creditStatus = "committed";
            audit.creditReservationId = reservationId;
        }

        // Mark analysis as completed.
        audit.isUnlocked = true;
        audit.aiCompletedAt = new Date();
        audit.status = "completed";
        audit.progress = 100;
        audit.currentStep = "completed";
        audit.progressMessage = intelMode
            ? "Intelligence report is ready."
            : "Full audit unlocked successfully.";
        audit.aiProcessingStartedAt = null;
        audit.error = null;

        await audit.save();

        return res.status(200).json({
            success: true,
            message: intelMode
                ? "Intelligence analysis completed successfully"
                : "Full audit unlocked successfully",
            data: {
                auditId: audit._id,
                status: audit.status,
                progress: audit.progress,
                currentStep: audit.currentStep,
                progressMessage: audit.progressMessage,
                score: audit.score,
                isUnlocked: true,
                aiAudit: audit.aiAudit,
                ...(intelMode
                    ? {}
                    : { creditsUsed: MAIN_AUDIT_COST })
            }
        });
    } catch (error) {
        console.error("AI analysis error:", error);

        // Release reserved Main credits if AI did not succeed.
        if (reservationId && !aiSucceeded) {
            try {
                await releaseAuditCredits({
                    reservationId,
                    reason: error.message || "AI analysis failed"
                });
            } catch (releaseError) {
                console.error(
                    "Failed to release audit credits:",
                    releaseError
                );
            }
        }

        try {
            const failedAudit =
                audit ||
                await Audit.findOne({
                    _id: req.params.id,
                    user: req.user.id
                });

            if (failedAudit) {
                const failedIsIntel = isIntelAudit(failedAudit);

                if (aiSucceeded && !failedIsIntel) {
                    // AI succeeded, but Main credit commitment failed.
                    failedAudit.status = "ai_processing";
                    failedAudit.creditStatus = "commit_pending";
                    failedAudit.isUnlocked = false;
                    failedAudit.currentStep = "credit_commit_pending";
                    failedAudit.progress = 95;
                    failedAudit.progressMessage =
                        "AI analysis completed. Credit finalization is pending.";
                    failedAudit.error =
                        `Credit commit requires retry: ${error.message}`;
                } else if (!aiSucceeded) {
                    // Keep the audit retryable if AI processing failed.
                    failedAudit.status = "crawled";
                    failedAudit.progress = 70;
                    failedAudit.currentStep = "ready_for_ai";
                    failedAudit.progressMessage =
                        "AI analysis failed. Your store audit is still available.";
                    failedAudit.error = error.message;
                    failedAudit.aiProcessingStartedAt = null;
                    failedAudit.isUnlocked = failedIsIntel;
                    failedAudit.creditStatus = "not_required";
                    failedAudit.creditReservationId = null;
                }

                await failedAudit.save();
            }
        } catch (saveError) {
            console.error("Failed to save AI error:", saveError);
        }

        return res.status(500).json({
            success: false,
            message: "AI analysis failed",
            error: error.message
        });
    }
};

// ========================================
// CREATE PUBLIC REPORT
// POST /api/audits/:id/share
// ========================================

const createPublicReport = async (req, res) => {
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

        if (audit.status !== "completed" || !audit.aiAudit) {
            return res.status(400).json({
                success: false,
                message: "Only completed audits can be shared"
            });
        }

        if (!isAuditUnlocked(audit)) {
            return res.status(403).json({
                success: false,
                message: "Unlock this audit before sharing its report"
            });
        }

        if (
            audit.publicReport?.enabled &&
            audit.publicReport?.token
        ) {
            return res.status(200).json({
                success: true,
                message: "Public report already exists",
                data: {
                    token: audit.publicReport.token,
                    enabled: audit.publicReport.enabled,
                    createdAt: audit.publicReport.createdAt
                }
            });
        }

        const token = crypto.randomBytes(16).toString("hex");

        audit.publicReport = {
            enabled: true,
            token,
            createdAt: new Date()
        };

        await audit.save();

        return res.status(201).json({
            success: true,
            message: "Public report created successfully",
            data: {
                token,
                enabled: true,
                createdAt: audit.publicReport.createdAt
            }
        });
    } catch (error) {
        console.error("Create public report error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to create public report",
            error: error.message
        });
    }
};

// ========================================
// GET PUBLIC REPORT
// GET /api/audits/public/:token
// NO AUTHENTICATION
// ========================================

const getPublicReport = async (req, res) => {
    try {
        const { token } = req.params;

        if (
            !token ||
            typeof token !== "string" ||
            token.length < 20
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid public report token"
            });
        }

        const audit = await Audit.findOne({
            "publicReport.token": token,
            "publicReport.enabled": true,
            status: "completed"
        }).select(
            "productMode storeUrl requestedUrl finalUrl storeName status score aiAudit createdAt updatedAt publicReport isUnlocked"
        );

        if (
            !audit ||
            (!isIntelAudit(audit) && audit.isUnlocked !== true)
        ) {
            return res.status(404).json({
                success: false,
                message:
                    "Public report not found or no longer available"
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
                updatedAt: audit.updatedAt,
                sharedAt: audit.publicReport.createdAt
            }
        });
    } catch (error) {
        console.error("Get public report error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve public report",
            error: error.message
        });
    }
};

// ========================================
// REVOKE PUBLIC REPORT
// DELETE /api/audits/:id/share
// ========================================

const revokePublicReport = async (req, res) => {
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

        if (!audit.publicReport) {
            return res.status(400).json({
                success: false,
                message: "This audit has no public report"
            });
        }

        audit.publicReport.enabled = false;
        await audit.save();

        return res.status(200).json({
            success: true,
            message: "Public report link revoked"
        });
    } catch (error) {
        console.error("Revoke public report error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to revoke public report",
            error: error.message
        });
    }
};

module.exports = {
    getAuditById,
    getAuditReport,
    analyzeAudit,
    getUserAudits,
    createPublicReport,
    getPublicReport,
    revokePublicReport
};
