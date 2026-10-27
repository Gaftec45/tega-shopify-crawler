
const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    productUrl: { type: String, required: true },
    price: { type: Number, default: null },
    currency: { type: String, default: null },
  },
  { _id: false }
);

const competitorSnapshotSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    competitorId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    platform: {
      type: String,
      enum: ["shopify"],
      required: true,
    },
    storeUrl: { type: String, required: true },
    scannedAt: { type: Date, default: Date.now, index: true },
    products: { type: [productSchema], default: [] },
    productCount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["completed", "failed"],
      default: "completed",
    },
    error: { type: String, default: null },
  },
  { timestamps: true }
);

competitorSnapshotSchema.index({
  user: 1,
  competitorId: 1,
  scannedAt: -1,
});

module.exports = mongoose.model(
  "CompetitorSnapshot",
  competitorSnapshotSchema
);