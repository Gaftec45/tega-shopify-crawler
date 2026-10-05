const mongoose = require("mongoose");
const crypto = require("crypto");
const Audit = require("../models/audit.model");
const {
    reserveAuditCredits,
    commitAuditCredits,
    releaseAuditCredits
} = require("../services/main/mainApiService");


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
                    "_id user storeUrl requestedUrl finalUrl storeName status score productsFound progress currentStep progressMessage error isUnlocked createdAt updatedAt contact"
                )
                .sort({
                    createdAt: -1
                })
                .skip(skip)
                .limit(limit)
                .lean(),

            Audit.countDocuments(filter)
        ]);

        const safeAudits = audits.map((audit) => {
            const unlocked =
                audit.isUnlocked === true;

            return {
                _id: audit._id,

                storeUrl:
                    audit.storeUrl,

                requestedUrl:
                    audit.requestedUrl,

                finalUrl:
                    audit.finalUrl,

                storeName:
                    audit.storeName,

                status:
                    audit.status,

                score:
                    audit.score,

                productsFound:
                    audit.productsFound,

                progress:
                    audit.progress,

                currentStep:
                    audit.currentStep,

                progressMessage:
                    audit.progressMessage,

                error:
                    audit.error,

                isUnlocked:
                    unlocked,

                contact: {
                    totalEmails:
                        Number(
                            audit.contact?.totalEmails || 0
                        ),

                    // Don't expose actual emails here
                    emails: unlocked
                        ? audit.contact?.emails || []
                        : [],

                    primaryEmail: unlocked
                        ? audit.contact?.primaryEmail || null
                        : null,

                    pagesCrawled: unlocked
                        ? audit.contact?.pagesCrawled || []
                        : []
                },

                createdAt:
                    audit.createdAt,

                updatedAt:
                    audit.updatedAt
            };
        });

        return res.status(200).json({
            success: true,
            count: safeAudits.length,
            total,
            page,
            limit,
            totalPages:
                Math.ceil(total / limit),
            data: safeAudits
        });

    } catch (error) {
        console.error(
            "Get user audits error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to retrieve audits",
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
        }).lean();

        if (!audit) {
            return res.status(404).json({
                success: false,
                message: "Audit not found"
            });
        }

        const unlocked = audit.isUnlocked === true;

        const response = {
            _id: audit._id,
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

            // Useful for the frontend
            contact: {
                totalEmails:
                    Number(audit.contact?.totalEmails || 0),

            pagesCrawled: unlocked
                ? audit.contact?.pagesCrawled || []
                : [],

                // NEVER expose emails while locked
                emails: unlocked
                    ? audit.contact?.emails || []
                    : [],

                primaryEmail: unlocked
                    ? audit.contact?.primaryEmail || null
                    : null
            }
        };

        // Only expose detailed audit data after unlock
        if (unlocked) {
            response.deterministicAudit =
                audit.deterministicAudit || null;

            response.aiAudit =
                audit.aiAudit || null;

            response.crawl =
                audit.crawl || null;
        }

        return res.status(200).json({
            success: true,
            data: response
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
        }).lean();

        if (!audit) {
            return res.status(404).json({
                success: false,
                message: "Audit not found"
            });
        }

        const unlocked =
            audit.isUnlocked === true;

        const data = {
            id: audit._id,

            storeUrl: audit.storeUrl,

            requestedUrl:
                audit.requestedUrl,

            finalUrl:
                audit.finalUrl,

            storeName:
                audit.storeName,

            status:
                audit.status,

            score:
                audit.score,

            isUnlocked:
                unlocked,

            contact: {
                totalEmails:
                    Number(
                        audit.contact?.totalEmails || 0
                    ),

            pagesCrawled: unlocked
                ? audit.contact?.pagesCrawled || []
                : [],

                emails: unlocked
                    ? audit.contact?.emails || []
                    : [],

                primaryEmail: unlocked
                    ? audit.contact?.primaryEmail || null
                    : null
            },

            createdAt:
                audit.createdAt,

            updatedAt:
                audit.updatedAt
        };

        /*
         * Full report data is only returned
         * after the audit has been unlocked.
         */
        if (unlocked) {
            data.deterministicAudit =
                audit.deterministicAudit || null;

            data.aiAudit =
                audit.aiAudit || null;

            data.crawl =
                audit.crawl || null;
        }

        return res.status(200).json({
            success: true,
            data
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

// const analyzeAudit = async (req, res) => {
//     try {
//         const { id } = req.params;

//         // --------------------------------
//         // VALIDATE AUDIT ID
//         // --------------------------------

//         if (!mongoose.Types.ObjectId.isValid(id)) {
//             return res.status(400).json({
//                 success: false,
//                 message: "Invalid audit ID"
//             });
//         }

//         // --------------------------------
//         // FIND USER'S AUDIT
//         // --------------------------------

//         const audit = await Audit.findOne({
//             _id: id,
//             user: req.user.id
//         });

//         if (!audit) {
//             return res.status(404).json({
//                 success: false,
//                 message: "Audit not found"
//             });
//         }

//         // --------------------------------
//         // MAKE SURE CRAWL + DETERMINISTIC
//         // ANALYSIS ARE COMPLETE
//         // --------------------------------

//         if (
//             !audit.crawl ||
//             !audit.deterministicAudit
//         ) {
//             return res.status(400).json({
//                 success: false,
//                 message:
//                     "Audit must be crawled and analyzed before AI analysis"
//             });
//         }

//         // --------------------------------
//         // PREVENT DUPLICATE AI PROCESSING
//         // --------------------------------

//         if (audit.status === "ai_processing") {
//             return res.status(409).json({
//                 success: false,
//                 message:
//                     "AI analysis is already in progress"
//             });
//         }

//         // --------------------------------
//         // AI ALREADY COMPLETED
//         // --------------------------------

//         if (
//             audit.status === "completed" &&
//             audit.aiAudit
//         ) {
//             return res.status(200).json({
//                 success: true,
//                 message:
//                     "AI analysis already completed",
//                 data: {
//                     auditId: audit._id,
//                     status: audit.status,
//                     progress: audit.progress,
//                     currentStep: audit.currentStep,
//                     progressMessage:
//                         audit.progressMessage,
//                     score: audit.score,
//                     aiAudit: audit.aiAudit
//                 }
//             });
//         }

//         // --------------------------------
//         // START AI PROCESSING
//         // --------------------------------
//         //
//         // Deterministic audit should already
//         // be around 70%.
//         //

//         audit.status = "ai_processing";

//         audit.progress = 75;

//         audit.currentStep =
//             "building_ai_payload";

//         audit.progressMessage =
//             "Preparing audit data for AI...";

//         audit.error = null;

//         await audit.save();

//         // --------------------------------
//         // LOAD AI SERVICES
//         // --------------------------------

//         const {
//             buildAiAuditPayload
//         } = require("../services/ai/audit.payload");

//         const {
//             buildAuditPrompt
//         } = require("../services/ai/audit.prompt");

//         const {
//             analyzeWithOpenRouter
//         } = require("../services/ai/openrouter.service");

//         // --------------------------------
//         // BUILD AI PAYLOAD
//         // --------------------------------

//         console.log(
//             `Building AI payload for audit: ${audit._id}`
//         );

//         const aiPayload =
//             buildAiAuditPayload(
//                 audit.crawl,
//                 audit.deterministicAudit
//             );

//         audit.progress = 78;

//         audit.currentStep =
//             "building_ai_prompt";

//         audit.progressMessage =
//             "Preparing AI analysis...";

//         await audit.save();

//         // --------------------------------
//         // BUILD AI PROMPT
//         // --------------------------------

//         console.log(
//             `Building AI prompt for audit: ${audit._id}`
//         );

//         const {
//             systemPrompt,
//             userPrompt
//         } = buildAuditPrompt(
//             aiPayload
//         );

//         audit.progress = 80;

//         audit.currentStep =
//             "ai_processing";

//         audit.progressMessage =
//             "AI is analyzing your store...";

//         await audit.save();

//         // --------------------------------
//         // OPENROUTER
//         // --------------------------------

//         console.log(
//             `Sending audit to OpenRouter: ${audit._id}`
//         );

//         const aiAudit =
//             await analyzeWithOpenRouter({
//                 systemPrompt,
//                 userPrompt
//             });

//         // --------------------------------
//         // AI RESPONSE RECEIVED
//         // --------------------------------

//         console.log(
//             `AI response received for audit: ${audit._id}`
//         );

//         audit.aiAudit =
//             aiAudit;

//         audit.progress = 95;

//         audit.currentStep =
//             "analysis_completed";

//         audit.progressMessage =
//             "AI analysis completed. Preparing your report...";

//         await audit.save();

//         // --------------------------------
//         // COMPLETE AUDIT
//         // --------------------------------

//         audit.status =
//             "completed";

//         audit.progress =
//             100;

//         audit.currentStep =
//             "completed";

//         audit.progressMessage =
//             "Audit completed successfully.";

//         audit.error =
//             null;

//         await audit.save();

//         console.log(
//             `AI analysis completed: ${audit._id}`
//         );

//         // --------------------------------
//         // RESPONSE
//         // --------------------------------

//         return res.status(200).json({
//             success: true,

//             message:
//                 "AI analysis completed successfully",

//             data: {
//                 auditId: audit._id,
//                 status: audit.status,
//                 progress: audit.progress,
//                 currentStep: audit.currentStep,
//                 progressMessage:
//                     audit.progressMessage,
//                 score: audit.score,
//                 aiAudit: audit.aiAudit
//             }
//         });

//     } catch (error) {

//         console.error(
//             "AI analysis error:",
//             error
//         );

//         // --------------------------------
//         // AI FAILED
//         // --------------------------------
//         //
//         // Keep the crawl and deterministic
//         // audit. Only reset the AI stage.
//         //

//         try {
//             const { id } = req.params;

//             if (
//                 mongoose.Types.ObjectId.isValid(id)
//             ) {
//                 await Audit.findOneAndUpdate(
//                     {
//                         _id: id,
//                         user: req.user.id
//                     },
//                     {
//                         status: "crawled",

//                         progress: 70,

//                         currentStep:
//                             "ai_failed",

//                         progressMessage:
//                             "AI analysis failed. Your store audit is still available.",

//                         error:
//                             error.message
//                     }
//                 );
//             }

//         } catch (saveError) {

//             console.error(
//                 "Failed to save AI error:",
//                 saveError
//             );
//         }

//         return res.status(500).json({
//             success: false,

//             message:
//                 "AI analysis failed",

//             error:
//                 error.message
//         });
//     }
// };


const analyzeAudit = async (req, res) => {
    let reservationId = null;
    let aiSucceeded = false;

    try {
        const { id } = req.params;

        // ========================================
        // VALIDATE AUDIT ID
        // ========================================

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid audit ID",
            });
        }

        // ========================================
        // FIND AUDIT
        // ========================================

        const existingAudit = await Audit.findOne({
            _id: id,
            user: req.user.id,
        });

        if (!existingAudit) {
            return res.status(404).json({
                success: false,
                message: "Audit not found",
            });
        }

        // ========================================
        // ALREADY UNLOCKED
        // ========================================

        if (
            existingAudit.isUnlocked === true &&
            existingAudit.status === "completed" &&
            existingAudit.aiAudit
        ) {
            return res.status(200).json({
                success: true,
                message: "Full audit already unlocked",
                data: {
                    auditId:
                        existingAudit._id,

                    status:
                        existingAudit.status,

                    progress:
                        existingAudit.progress,

                    currentStep:
                        existingAudit.currentStep,

                    progressMessage:
                        existingAudit.progressMessage,

                    score:
                        existingAudit.score,

                    isUnlocked:
                        true,

                    aiAudit:
                        existingAudit.aiAudit,
                },
            });
        }

        // ========================================
        // AI COMPLETED BUT CREDIT COMMIT PENDING
        // ========================================

        if (
            existingAudit.creditStatus ===
                "commit_pending" &&
            existingAudit.aiAudit
        ) {
            return res.status(409).json({
                success: false,
                message:
                    "AI analysis completed, but credit finalization is still pending. Please try again shortly.",
            });
        }

        // ========================================
        // MAKE SURE CRAWL + DETERMINISTIC AUDIT
        // ARE COMPLETE
        // ========================================

        if (
            !existingAudit.crawl ||
            !existingAudit.deterministicAudit
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Audit must be crawled and analyzed before AI analysis",
            });
        }

        // ========================================
        // HANDLE EXISTING AI PROCESS
        // ========================================

        if (
            existingAudit.status ===
            "ai_processing"
        ) {
            const startedAt =
                existingAudit.aiProcessingStartedAt;

            const processingTime = startedAt
                ? Date.now() -
                  new Date(startedAt).getTime()
                : 0;

            const MAX_PROCESSING_TIME =
                10 * 60 * 1000;

            // ------------------------------------
            // STILL PROCESSING
            // ------------------------------------

            if (
                startedAt &&
                processingTime <
                    MAX_PROCESSING_TIME
            ) {
                return res.status(409).json({
                    success: false,
                    message:
                        "AI analysis is already in progress",
                });
            }

            // ------------------------------------
            // STALE PROCESS
            // ------------------------------------

            console.warn(
                `Stale AI process detected for audit: ${id}`
            );

            // ------------------------------------
            // RELEASE STALE RESERVATION
            // ------------------------------------

            if (
                existingAudit.creditReservationId &&
                existingAudit.creditStatus ===
                    "reserved"
            ) {
                try {
                    await releaseAuditCredits({
                        reservationId:
                            existingAudit.creditReservationId,

                        reason:
                            "Stale AI analysis process recovered",
                    });

                    console.log(
                        `Released stale credit reservation: ${existingAudit.creditReservationId}`
                    );
                } catch (releaseError) {
                    console.error(
                        "Failed to release stale reservation:",
                        releaseError
                    );

                    return res.status(500).json({
                        success: false,
                        message:
                            "The previous AI analysis is stuck and its credit reservation could not be released. Please try again.",
                    });
                }
            }

            // ------------------------------------
            // RESET AUDIT
            // ------------------------------------

            existingAudit.status =
                "crawled";

            existingAudit.progress =
                70;

            existingAudit.currentStep =
                "ready_for_ai";

            existingAudit.progressMessage =
                "Previous AI analysis stopped unexpectedly. You can try again.";

            existingAudit.aiProcessingStartedAt =
                null;

            existingAudit.creditReservationId =
                null;

            existingAudit.creditStatus =
                "not_required";

            existingAudit.error =
                null;

            existingAudit.isUnlocked =
                false;

            await existingAudit.save();

            return res.status(409).json({
                success: false,
                message:
                    "The previous AI analysis timed out. Please click Unlock Full Audit again.",
            });
        }

        // ========================================
        // ATOMICALLY CLAIM AI PROCESSING
        // ========================================

        const audit =
            await Audit.findOneAndUpdate(
                {
                    _id: id,

                    user: req.user.id,

                    status: "crawled",

                    $or: [
                        {
                            aiAudit: {
                                $exists: false,
                            },
                        },
                        {
                            aiAudit: null,
                        },
                    ],
                },

                {
                    $set: {
                        status:
                            "ai_processing",

                        aiProcessingStartedAt:
                            new Date(),

                        progress: 75,

                        currentStep:
                            "building_ai_payload",

                        progressMessage:
                            "Preparing audit data for AI...",

                        error: null,
                    },
                },

                {
                    returnDocument:
                        "after",
                }
            );

        // ========================================
        // AUDIT WAS ALREADY CLAIMED
        // ========================================

        if (!audit) {
            const latestAudit =
                await Audit.findOne({
                    _id: id,
                    user: req.user.id,
                });

            if (!latestAudit) {
                return res.status(404).json({
                    success: false,
                    message: "Audit not found",
                });
            }

            // ------------------------------------
            // ALREADY UNLOCKED
            // ------------------------------------

            if (
                latestAudit.isUnlocked === true &&
                latestAudit.status ===
                    "completed" &&
                latestAudit.aiAudit
            ) {
                return res.status(200).json({
                    success: true,
                    message:
                        "Full audit already unlocked",
                    data: {
                        auditId:
                            latestAudit._id,

                        status:
                            latestAudit.status,

                        progress:
                            latestAudit.progress,

                        currentStep:
                            latestAudit.currentStep,

                        progressMessage:
                            latestAudit.progressMessage,

                        score:
                            latestAudit.score,

                        isUnlocked:
                            true,

                        aiAudit:
                            latestAudit.aiAudit,
                    },
                });
            }

            // ------------------------------------
            // PROCESSING
            // ------------------------------------

            if (
                latestAudit.status ===
                "ai_processing"
            ) {
                return res.status(409).json({
                    success: false,
                    message:
                        "AI analysis is already in progress",
                });
            }

            // ------------------------------------
            // NOT AVAILABLE
            // ------------------------------------

            return res.status(409).json({
                success: false,
                message:
                    "Audit is not currently available for unlocking",
            });
        }

        console.log(
            `AI processing claimed successfully: ${audit._id}`
        );

        // ========================================
        // RESERVE 8 CREDITS
        // ========================================

        console.log(
            `Reserving AI credits for audit: ${audit._id}`
        );

        const reservation =
            await reserveAuditCredits({
                userId:
                    req.user.id,

                amount:
                    8,

                feature:
                    "full_audit_unlock",

                reference:
                    `audit-unlock-${audit._id}`,

                description:
                    "Full Shopify audit unlock and AI analysis",

                metadata: {
                    auditId:
                        audit._id.toString(),

                    auditUrl:
                        audit.storeUrl ||
                        audit.url ||
                        null,
                },
            });

        reservationId =
            reservation.reservation.id;

        // ========================================
        // SAVE CREDIT RESERVATION
        // ========================================

        audit.creditReservationId =
            reservationId;

        audit.creditStatus =
            "reserved";

        audit.isUnlocked =
            false;

        await audit.save();

        console.log(
            `AI credits reserved: ${reservationId}`
        );

        // ========================================
        // LOAD AI SERVICES
        // ========================================

        const {
            buildAiAuditPayload,
        } =
            require(
                "../services/ai/audit.payload"
            );

        const {
            buildAuditPrompt,
        } =
            require(
                "../services/ai/audit.prompt"
            );

        const {
            analyzeWithOpenRouter,
        } =
            require(
                "../services/ai/openrouter.service"
            );

        // ========================================
        // BUILD AI PAYLOAD
        // ========================================

        console.log(
            `Building AI payload for audit: ${audit._id}`
        );

        const aiPayload =
            buildAiAuditPayload(
                audit.crawl,
                audit.deterministicAudit
            );

        audit.progress =
            78;

        audit.currentStep =
            "building_ai_prompt";

        audit.progressMessage =
            "Preparing AI analysis...";

        await audit.save();

        // ========================================
        // BUILD AI PROMPT
        // ========================================

        console.log(
            `Building AI prompt for audit: ${audit._id}`
        );

        const {
            systemPrompt,
            userPrompt,
        } =
            buildAuditPrompt(
                aiPayload
            );

        audit.progress =
            80;

        audit.currentStep =
            "ai_processing";

        audit.progressMessage =
            "AI is analyzing your store...";

        await audit.save();

        // ========================================
        // OPENROUTER
        // ========================================

        console.log(
            `Sending audit to OpenRouter: ${audit._id}`
        );

        const aiAudit =
            await analyzeWithOpenRouter({
                systemPrompt,
                userPrompt,
            });

        // ========================================
        // AI SUCCEEDED
        // ========================================

        aiSucceeded =
            true;

        console.log(
            `AI response received for audit: ${audit._id}`
        );

        // ========================================
        // SAVE AI RESULT
        // ========================================

        audit.aiAudit =
            aiAudit;

        audit.progress =
            95;

        audit.currentStep =
            "analysis_completed";

        audit.progressMessage =
            "AI analysis completed. Finalizing credits...";

        audit.creditStatus =
            "commit_pending";

        // IMPORTANT:
        // Still locked at this point.
        audit.isUnlocked =
            false;

        await audit.save();

        // ========================================
        // COMMIT CREDITS
        // ========================================

        console.log(
            `Committing AI credits for audit: ${audit._id}`
        );

        await commitAuditCredits({
            reservationId,
        });

        console.log(
            `AI credits committed: ${reservationId}`
        );

        // ========================================
        // FINALIZE + UNLOCK AUDIT
        // ========================================

        audit.creditStatus =
            "committed";

        audit.isUnlocked =
            true;

        audit.status =
            "completed";

        audit.progress =
            100;

        audit.currentStep =
            "completed";

        audit.progressMessage =
            "Full audit unlocked successfully.";

        audit.aiProcessingStartedAt =
            null;

        audit.creditReservationId =
            reservationId;

        audit.error =
            null;

        await audit.save();

        console.log(
            `Full audit unlocked: ${audit._id}`
        );

        // ========================================
        // RESPONSE
        // ========================================

        return res.status(200).json({
            success: true,

            message:
                "Full audit unlocked successfully",

            data: {
                auditId:
                    audit._id,

                status:
                    audit.status,

                progress:
                    audit.progress,

                currentStep:
                    audit.currentStep,

                progressMessage:
                    audit.progressMessage,

                score:
                    audit.score,

                isUnlocked:
                    true,

                aiAudit:
                    audit.aiAudit,

                creditsUsed:
                    8,
            },
        });

    } catch (error) {

        console.error(
            "AI analysis error:",
            error
        );

        // ========================================
        // CREDIT HANDLING
        // ========================================

        if (reservationId) {
            try {

                // ====================================
                // AI DID NOT SUCCEED
                // ====================================

                if (!aiSucceeded) {

                    console.log(
                        `AI failed. Releasing credits: ${reservationId}`
                    );

                    await releaseAuditCredits({
                        reservationId,

                        reason:
                            error.message ||
                            "AI analysis failed",
                    });

                    console.log(
                        `AI credits released: ${reservationId}`
                    );

                    await Audit.findOneAndUpdate(
                        {
                            _id:
                                req.params.id,

                            user:
                                req.user.id,
                        },

                        {
                            $set: {
                                status:
                                    "crawled",

                                progress:
                                    70,

                                currentStep:
                                    "ready_for_ai",

                                progressMessage:
                                    "AI analysis failed. Your store audit is still available.",

                                error:
                                    error.message,

                                aiProcessingStartedAt:
                                    null,

                                creditReservationId:
                                    null,

                                creditStatus:
                                    "not_required",

                                isUnlocked:
                                    false,
                            },
                        },

                        {
                            returnDocument:
                                "after",
                        }
                    );
                }

                // ====================================
                // AI SUCCEEDED BUT CREDIT COMMIT FAILED
                // ====================================

                else {

                    console.error(
                        `AI succeeded but credit commit failed. Reservation remains pending: ${reservationId}`
                    );

                    await Audit.findOneAndUpdate(
                        {
                            _id:
                                req.params.id,

                            user:
                                req.user.id,
                        },

                        {
                            $set: {
                                status:
                                    "ai_processing",

                                creditStatus:
                                    "commit_pending",

                                isUnlocked:
                                    false,

                                currentStep:
                                    "credit_commit_pending",

                                progress:
                                    95,

                                progressMessage:
                                    "AI analysis completed. Finalizing billing...",

                                error:
                                    `Credit commit requires retry: ${error.message}`,
                            },
                        },

                        {
                            returnDocument:
                                "after",
                        }
                    );
                }

            } catch (creditError) {

                console.error(
                    "Credit finalization error:",
                    creditError
                );
            }
        }

        // ========================================
        // RESET AI STAGE ONLY IF AI FAILED
        // ========================================

        if (!aiSucceeded) {

            try {

                const { id } =
                    req.params;

                if (
                    mongoose.Types.ObjectId.isValid(
                        id
                    )
                ) {

                    await Audit.findOneAndUpdate(
                        {
                            _id: id,
                            user: req.user.id,
                        },

                        {
                            $set: {
                                status:
                                    "crawled",

                                progress:
                                    70,

                                currentStep:
                                    "ready_for_ai",

                                progressMessage:
                                    "AI analysis failed. Your store audit is still available.",

                                error:
                                    error.message,

                                aiProcessingStartedAt:
                                    null,

                                creditReservationId:
                                    null,

                                creditStatus:
                                    "not_required",

                                isUnlocked:
                                    false,
                            },
                        },

                        {
                            returnDocument:
                                "after",
                        }
                    );
                }

            } catch (saveError) {

                console.error(
                    "Failed to save AI error:",
                    saveError
                );
            }
        }

        // ========================================
        // ERROR RESPONSE
        // ========================================

        return res.status(500).json({
            success: false,

            message:
                "AI analysis failed",

            error:
                error.message,
        });
    }
};

// ========================================
// GENERATE PUBLIC REPORT
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

        // Only completed audits can be shared
        if (
            audit.status !== "completed" ||
            !audit.aiAudit
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Only completed audits can be shared"
            });
        }

        // Reuse existing public link
        if (
            audit.publicReport?.enabled &&
            audit.publicReport?.token
        ) {
            return res.status(200).json({
                success: true,
                message: "Public report already exists",
                data: {
                    token:
                        audit.publicReport.token,
                    enabled:
                        audit.publicReport.enabled,
                    createdAt:
                        audit.publicReport.createdAt
                }
            });
        }

        // Generate secure random token
        const token =
            crypto.randomBytes(16).toString("hex");

        audit.publicReport = {
            enabled: true,
            token,
            createdAt: new Date()
        };

        await audit.save();

        return res.status(201).json({
            success: true,
            message:
                "Public report created successfully",
            data: {
                token,
                enabled: true,
                createdAt:
                    audit.publicReport.createdAt
            }
        });

    } catch (error) {
        console.error(
            "Create public report error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to create public report",
            error: error.message
        });
    }
};


// ========================================
// GET PUBLIC REPORT
// GET /api/public/:token
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
            "storeUrl requestedUrl finalUrl storeName status score aiAudit createdAt updatedAt publicReport"
        );

        if (!audit) {
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

                storeUrl:
                    audit.storeUrl,

                requestedUrl:
                    audit.requestedUrl,

                finalUrl:
                    audit.finalUrl,

                storeName:
                    audit.storeName,

                status:
                    audit.status,

                score:
                    audit.score,

                aiAudit:
                    audit.aiAudit,

                createdAt:
                    audit.createdAt,

                updatedAt:
                    audit.updatedAt,

                sharedAt:
                    audit.publicReport.createdAt
            }
        });

    } catch (error) {
        console.error(
            "Get public report error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to retrieve public report",
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

        audit.publicReport.enabled =
            false;

        await audit.save();

        return res.status(200).json({
            success: true,
            message:
                "Public report link revoked"
        });

    } catch (error) {
        console.error(
            "Revoke public report error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to revoke public report",
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