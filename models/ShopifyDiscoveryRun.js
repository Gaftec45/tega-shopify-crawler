
const mongoose = require("mongoose");

const shopifyDiscoveryRunSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true
        },

        providers: [{
            type: String,
            enum: ["actor1", "actor3"]
        }],

        query: {
            type: String,
            required: true,
            trim: true
        },

        country: {
            type: String,
            uppercase: true,
            default: "US"
        },

        maxItems: {
            type: Number,
            default: 50,
            min: 1
        },

        status: {
            type: String,
            enum: [
                "pending",
                "running",
                "completed",
                "partial",
                "failed"
            ],
            default: "pending",
            index: true
        },

        // =====================================
        // CREDIT RESERVATION AND SETTLEMENT
        // =====================================

        creditReservationId: {
            type: String,
            default: null
        },

        reservedCredits: {
            type: Number,
            default: 0,
            min: 0
        },

        chargedCredits: {
            type: Number,
            default: 0,
            min: 0
        },

        releasedCredits: {
            type: Number,
            default: 0,
            min: 0
        },

        billingStatus: {
            type: String,
            enum: [
                "not_started",
                "reserved",
                "settled",
                "released"
            ],
            default: "not_started",
            index: true
        },

        leadBreakdown: {
            storeProfile: {
                type: Number,
                default: 0
            },

            contactLead: {
                type: Number,
                default: 0
            },

            businessLead: {
                type: Number,
                default: 0
            },

            completeLead: {
                type: Number,
                default: 0
            }
        },

        billingError: {
            type: String,
            default: null
        },

        // =====================================
        // PROVIDER RUNS
        // =====================================

        providerRuns: [{
            provider: {
                type: String,
                enum: ["actor1", "actor3"]
            },

            actorRunId: {
                type: String,
                default: null
            },

            datasetId: {
                type: String,
                default: null
            },

            exitCode: {
                type: Number,
                default: null
            },

            inputItems: {
                type: Number,
                default: 0
            },

            status: {
                type: String,
                enum: [
                    "pending",
                    "running",
                    "succeeded",
                    "partial",
                    "failed",
                    "aborted"
                ],
                default: "pending"
            },

            discovered: {
                type: Number,
                default: 0
            },

            saved: {
                type: Number,
                default: 0
            },

            error: {
                type: String,
                default: null
            },

            startedAt: Date,

            finishedAt: Date
        }],

        // =====================================
        // DISCOVERY RESULTS
        // =====================================

        totalDiscovered: {
            type: Number,
            default: 0
        },

        totalSaved: {
            type: Number,
            default: 0
        },

        totalDuplicates: {
            type: Number,
            default: 0
        },

        totalFailed: {
            type: Number,
            default: 0
        },

        // Apify cost, separate from user credit billing.
        estimatedCost: {
            type: Number,
            default: 0
        },

        error: {
            type: String,
            default: null
        },

        startedAt: Date,

        finishedAt: Date
    },
    {
        timestamps: true
    }
);

shopifyDiscoveryRunSchema.index({
    user: 1,
    createdAt: -1
});

shopifyDiscoveryRunSchema.index({
    billingStatus: 1,
    status: 1
});

module.exports = mongoose.model(
    "ShopifyDiscoveryRun",
    shopifyDiscoveryRunSchema
);