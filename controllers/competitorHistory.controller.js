
const mongoose = require("mongoose");
const CompetitorSnapshot = require("../models/competitor-snapshot.model");
const { getVerifiedCompetitor } = require("../services/main/mainApiService");

const getCompetitorHistory = async (req, res) => {
  try {
    const { competitorId } = req.params;
    const userId = req.user?.id;

    if (
      !mongoose.isValidObjectId(competitorId) ||
      !mongoose.isValidObjectId(userId)
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid competitor ID is required",
      });
    }

    let competitor;

    try {
      competitor = await getVerifiedCompetitor({
        userId,
        competitorId,
      });
    } catch (error) {
      if (error.response?.status === 404) {
        return res.status(404).json({
          success: false,
          message: "Competitor not found for this account",
        });
      }

      console.error("Competitor verification failed:", error.message);

      return res.status(502).json({
        success: false,
        message: "Could not verify competitor ownership",
      });
    }

    const requestedLimit = Number.parseInt(req.query.limit, 10) || 10;
    const limit = Math.min(Math.max(requestedLimit, 1), 50);

    const snapshots = await CompetitorSnapshot.find({
      user: userId,
      competitorId,
    })
      .sort({ scannedAt: -1, _id: -1 })
      .limit(limit)
      .select(
        "_id platform storeUrl scannedAt productCount products status error"
      )
      .lean();

    return res.status(200).json({
      success: true,
      competitor: {
        id: competitor.id,
        name: competitor.competitorName,
        platform: competitor.platform,
        competitorUrl: competitor.competitorUrl,
      },
      count: snapshots.length,
      history: snapshots.map((snapshot) => ({
        id: snapshot._id.toString(),
        platform: snapshot.platform,
        storeUrl: snapshot.storeUrl,
        scannedAt: snapshot.scannedAt,
        productCount: snapshot.productCount,
        status: snapshot.status,
        error: snapshot.error,
        products: snapshot.products,
      })),
    });
  } catch (error) {
    console.error("Get competitor history failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve competitor scan history",
    });
  }
};

module.exports = { getCompetitorHistory };