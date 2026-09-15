const mongoose = require("mongoose");

const auditSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true
        },
        storeUrl: {
            type: String,
            required: true,
            trim: true
        },

        requestedUrl: {
            type: String,
            trim: true
        },

        finalUrl: {
            type: String,
            trim: true
        },

        storeName: {
            type: String,
            trim: true
        },

        status: {
            type: String,
            enum: [
                "pending",
                "crawling",
                "analyzing",
                "crawled",
                "ai_processing",
                "completed",
                "failed"
            ],
            default: "pending"
        },

        crawl: {
            type: mongoose.Schema.Types.Mixed,
            default: null
        },

        deterministicAudit: {
            type: mongoose.Schema.Types.Mixed,
            default: null
        },

        score: {
            type: mongoose.Schema.Types.Mixed,
            default: null
        },

        aiAudit: {
            type: mongoose.Schema.Types.Mixed,
            default: null
        },

        progress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
},

currentStep: {
    type: String,
    default: "queued"
},

progressMessage: {
    type: String,
    default: null
},

productsFound: {
    type: Number,
    default: 0
},

        error: {
            type: String,
            default: null
        },

        publicReport: {
    enabled: {
        type: Boolean,
        default: false
    },

    token: {
        type: String,
        unique: true,
        sparse: true,
        index: true
    },

    createdAt: {
        type: Date,
        default: null
    }
},
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("Audit", auditSchema);