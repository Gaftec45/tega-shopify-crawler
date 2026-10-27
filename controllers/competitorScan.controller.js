const mongoose = require("mongoose");

const CompetitorSnapshot = require("../models/competitor-snapshot.model");

const {
    getVerifiedCompetitor,
    updateCompetitorLastCheckedAt,
} = require("../services/main/mainApiService");

const {
    scanShopifyStore,
} = require("../services/competitor/shopifyScanner");

const {
    compareSnapshots,
} = require("../services/competitor/compareSnapshots");

const scanCompetitor = async (req, res) => {
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

        // 1. Verify competitor ownership through the main backend.
        let competitor;

        try {
            competitor = await getVerifiedCompetitor({
                userId,
                competitorId,
            });
        } catch (error) {
            const status = error.response?.status;

            if (status === 404) {
                return res.status(404).json({
                    success: false,
                    message: "Competitor not found for this account",
                });
            }

            if (status === 400) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid competitor details",
                });
            }

            console.error(
                "Competitor ownership verification failed:",
                error.message
            );

            return res.status(502).json({
                success: false,
                message: "Could not verify competitor ownership",
            });
        }

        // 2. Confirm that the competitor can be scanned.
        if (competitor.status !== "active") {
            return res.status(409).json({
                success: false,
                message: "This competitor is paused",
            });
        }

        if (competitor.platform !== "shopify") {
            return res.status(400).json({
                success: false,
                message:
                    "Only Shopify competitor scans are supported currently",
            });
        }

        // 3. Retrieve the most recent successful snapshot BEFORE
        // creating the new snapshot.
        const previousSnapshot = await CompetitorSnapshot.findOne({
            user: userId,
            competitorId,
            status: "completed",
        })
            .sort({ scannedAt: -1, _id: -1 })
            .lean();

        // 4. Scan the current Shopify storefront.
        const result = await scanShopifyStore(
            competitor.competitorUrl
        );

        // 5. Save the new snapshot to MongoDB.
        const snapshot = await CompetitorSnapshot.create({
            user: userId,
            competitorId,
            platform: "shopify",
            storeUrl: result.storeUrl,
            scannedAt: new Date(),
            products: result.products,
            productCount: result.productCount,
            status: "completed",
        });

        // 6. Compare the previous snapshot with this new snapshot.
        // A first scan has no previous snapshot, so all its products
        // are reported as new products.
        const comparison = compareSnapshots(
            previousSnapshot,
            snapshot.toObject()
        );

        // 7. Update lastCheckedAt in the main backend.
        // A timestamp update failure should not hide a scan that
        // has already completed and been saved successfully.
        let lastCheckedUpdated = true;

        try {
            await updateCompetitorLastCheckedAt({
                userId,
                competitorId,
                lastCheckedAt: snapshot.scannedAt,
            });
        } catch (error) {
            lastCheckedUpdated = false;

            console.error(
                "Scan saved, but lastCheckedAt update failed:",
                error.message
            );
        }

        // 8. Return the snapshot and comparison results.
        return res.status(200).json({
            success: true,
            message: previousSnapshot
                ? "Competitor scan completed and compared with the previous scan"
                : "First competitor scan completed",
            snapshot: {
                id: snapshot._id,
                competitorId: snapshot.competitorId,
                platform: snapshot.platform,
                storeUrl: snapshot.storeUrl,
                scannedAt: snapshot.scannedAt,
                productCount: snapshot.productCount,
                products: snapshot.products,
            },
            comparison: {
                ...comparison,
                isFirstScan: !previousSnapshot,
            },
            lastCheckedUpdated,
        });
    } catch (error) {
        console.error(
            "Competitor scan failed:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message:
                "Competitor scan failed. The storefront may be unavailable or blocking automated access.",
        });
    }
};

module.exports = { scanCompetitor };