const mongoose = require("mongoose");

const auditSchema = new mongoose.Schema(
    {
        // ========================================
        // USER
        // ========================================

        user: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
        },


        // ========================================
        // STORE INFORMATION
        // ========================================

        storeUrl: {
            type: String,
            required: true,
            trim: true,
        },

        requestedUrl: {
            type: String,
            trim: true,
        },

        finalUrl: {
            type: String,
            trim: true,
        },

        storeName: {
            type: String,
            trim: true,
        },


        // ========================================
        // AUDIT STATUS
        // ========================================

        status: {
            type: String,

            enum: [
                "pending",
                "crawling",
                "analyzing",
                "crawled",
                "ai_processing",
                "completed",
                "failed",
            ],

            default: "pending",

            index: true,
        },


        // ========================================
        // CRAWL DATA
        // ========================================

        crawl: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },


        // ========================================
        // CONTACT / EMAIL DATA
        // ========================================

        contact: {
            emails: {
                type: [
                    {
                        email: {
                            type: String,
                            trim: true,
                            lowercase: true,
                        },

                        type: {
                            type: String,
                            trim: true,
                            default: "other",
                        },

                        foundOn: {
                            type: [String],
                            default: [],
                        },
                    },
                ],

                default: [],
            },

            totalEmails: {
                type: Number,
                default: 0,
            },

            primaryEmail: {
                type: String,
                trim: true,
                lowercase: true,
                default: null,
            },

            pagesCrawled: {
                type: [String],
                default: [],
            },
        },


        // ========================================
        // DETERMINISTIC AUDIT
        // ========================================

        deterministicAudit: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },


        // ========================================
        // INITIAL SCORE
        // ========================================

        score: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },


        // ========================================
        // AI AUDIT RESULT
        // ========================================

        aiAudit: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },


        // ========================================
        // PROGRESS
        // ========================================

        progress: {
            type: Number,
            default: 0,
            min: 0,
            max: 100,
        },

        currentStep: {
            type: String,
            default: "queued",
        },

        progressMessage: {
            type: String,
            default: null,
        },


        // ========================================
        // PRODUCTS
        // ========================================

        productsFound: {
            type: Number,
            default: 0,
        },


        // ========================================
        // ERROR
        // ========================================

        error: {
            type: String,
            default: null,
        },


        // ========================================
        // AI PROCESSING CONTROL
        // ========================================

        aiProcessingStartedAt: {
            type: Date,
            default: null,
        },


        // ========================================
        // CREDIT BILLING
        // ========================================

        creditReservationId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },

        creditStatus: {
            type: String,

            enum: [
                "not_required",
                "reserved",
                "committed",
                "release_pending",
                "commit_pending",
            ],

            default: "not_required",

            index: true,
        },

        isUnlocked: {
            type: Boolean,
            default: false,
            index: true
        },


        // ========================================
        // PUBLIC REPORT
        // ========================================

        publicReport: {
            enabled: {
                type: Boolean,
                default: false,
            },

            token: {
                type: String,
                unique: true,
                sparse: true,
                index: true,
            },

            createdAt: {
                type: Date,
                default: null,
            },
        },
    },

    {
        timestamps: true,
    }
);


// ========================================
// INDEXES
// ========================================

auditSchema.index({
    user: 1,
    createdAt: -1,
});

auditSchema.index({
    status: 1,
    aiProcessingStartedAt: 1,
});

auditSchema.index({
    creditStatus: 1,
    creditReservationId: 1,
});


module.exports =
    mongoose.model("Audit", auditSchema);