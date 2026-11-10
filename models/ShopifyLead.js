
const mongoose = require("mongoose");

const shopifyLeadSchema = new mongoose.Schema(
    {
        // USER OWNERSHIP
        user: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true
        },

        discoveryRunId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ShopifyDiscoveryRun",
            default: null,
            index: true
        },

        // STORE IDENTITY
        storeName: {
            type: String,
            trim: true,
            default: null
        },

        providerStoreId: {
            type: String,
            default: null
        },

        domain: {
            type: String,
            required: true,
            lowercase: true,
            trim: true
        },

        storeUrl: {
            type: String,
            trim: true,
            default: null
        },

        country: {
            type: String,
            uppercase: true,
            default: null
        },

        category: {
            type: String,
            trim: true,
            default: null
        },

        // DISCOVERY SOURCE
        provider: {
            type: String,
            enum: ["actor1", "actor3"],
            required: true
        },

        actorRunId: {
            type: String,
            default: null
        },

        searchQuery: {
            type: String,
            trim: true,
            default: null
        },

        // CONTACT INFORMATION
        emails: [{
            email: {
                type: String,
                lowercase: true,
                trim: true
            },
            // Inside the email subdocument
            type: {
                type: String,
                enum: ["support", "sales", "general", "other"],
                default: "other"
            },
            source: {
                type: String,
                default: null
            }
        }],

        phones: [{
            type: String,
            trim: true
        }],

        socialLinks: [{
            platform: String,
            url: String
        }],

        // STORE INFORMATION
        description: {
            type: String,
            default: null
        },

        productsCount: {
            type: Number,
            default: 0
        },

        totalProductReviews: {
            type: Number,
            default: 0
        },

        totalProductRatings: {
            type: Number,
            default: 0
        },

        technologies: [{
            type: String
        }],

        products: [{
            name: String,
            price: String,
            url: String,
            image: String
        }],

        // LEAD QUALIFICATION
        leadScore: {
            type: Number,
            default: 0,
            min: 0,
            max: 100
        },

        qualification: {
            type: String,
            enum: ["unqualified", "low", "medium", "high"],
            default: "unqualified"
        },

        auditStatus: {
            type: String,
            enum: ["not_audited", "pending", "completed", "failed"],
            default: "not_audited"
        },

        audit: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Audit",
            default: null
        },

        // RAW PROVIDER DATA
        rawData: {
            type: mongoose.Schema.Types.Mixed,
            default: null
        },

        // TRACKING
        firstDiscoveredAt: {
            type: Date,
            default: Date.now
        },

        lastDiscoveredAt: {
            type: Date,
            default: Date.now
        }
    },
    {
        timestamps: true
    }
);

// Prevent duplicate stores for the same user.
shopifyLeadSchema.index(
    { user: 1, domain: 1 },
    { unique: true }
);

shopifyLeadSchema.index({ user: 1, createdAt: -1 });
shopifyLeadSchema.index({ user: 1, qualification: 1 });
shopifyLeadSchema.index({ user: 1, auditStatus: 1 });

module.exports = mongoose.model("ShopifyLead", shopifyLeadSchema);