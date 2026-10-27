
const mongoose = require("mongoose");
const CompetitorSnapshot = require("../models/competitor-snapshot.model");
const {
    getVerifiedCompetitors,
} = require("../services/main/mainApiService");
const {
    compareSnapshots,
} = require("../services/competitor/compareSnapshots");

const getCompetitorDashboard = async (req, res) => {
    try {
        const userId = req.user?.id;

        if (!mongoose.isValidObjectId(userId)) {
            return res.status(400).json({
                success: false,
                message: "A valid user ID is required",
            });
        }

        let competitors;

        try {
            competitors = await getVerifiedCompetitors({ userId });
        } catch (error) {
            console.error(
                "Dashboard competitor lookup failed:",
                error.message
            );

            return res.status(502).json({
                success: false,
                message: "Could not retrieve your competitors",
            });
        }

        const competitorIds = competitors.map((item) => item.id);

        const snapshots = competitorIds.length
            ? await CompetitorSnapshot.find({
                  user: userId,
                  competitorId: { $in: competitorIds },
              })
                  .sort({ scannedAt: -1, _id: -1 })
                  .lean()
            : [];

        const snapshotsByCompetitor = new Map();

        for (const snapshot of snapshots) {
            const key = snapshot.competitorId.toString();

            if (!snapshotsByCompetitor.has(key)) {
                snapshotsByCompetitor.set(key, []);
            }

            snapshotsByCompetitor.get(key).push(snapshot);
        }

        const metrics = {
            totalCompetitors: competitors.length,
            activeCompetitors: competitors.filter(
                (item) => item.status === "active"
            ).length,
            pausedCompetitors: competitors.filter(
                (item) => item.status === "paused"
            ).length,
            monitoredProducts: 0,
            successfulScans: snapshots.filter(
                (item) => item.status === "completed"
            ).length,
            failedScans: snapshots.filter(
                (item) => item.status === "failed"
            ).length,
            priceChanges: 0,
            priceIncreases: 0,
            priceDecreases: 0,
            newProducts: 0,
            removedProducts: 0,
        };

        const competitorSummaries = [];
        const allPriceChanges = [];
        const recentScans = [];

        for (const competitor of competitors) {
            const id = competitor.id.toString();
            const competitorSnapshots =
                snapshotsByCompetitor.get(id) || [];

            const successfulSnapshots = competitorSnapshots.filter(
                (item) => item.status === "completed"
            );

            const latestSnapshot = successfulSnapshots[0] || null;
            const previousSnapshot = successfulSnapshots[1] || null;

            const comparison =
                latestSnapshot && previousSnapshot
                    ? compareSnapshots(previousSnapshot, latestSnapshot)
                    : null;

            const priceChanges = comparison?.priceChanges || [];
            const newProducts = comparison?.newProducts || [];
            const removedProducts = comparison?.removedProducts || [];

            metrics.monitoredProducts +=
                latestSnapshot?.productCount ?? 0;

            metrics.priceChanges += priceChanges.length;
            metrics.priceIncreases += priceChanges.filter(
                (item) => item.direction === "increased"
            ).length;
            metrics.priceDecreases += priceChanges.filter(
                (item) => item.direction === "decreased"
            ).length;
            metrics.newProducts += newProducts.length;
            metrics.removedProducts += removedProducts.length;

            for (const change of priceChanges) {
                allPriceChanges.push({
                    ...change,
                    competitorId: id,
                    competitorName:
                        competitor.competitorName ||
                        competitor.competitorUrl,
                    scannedAt: latestSnapshot.scannedAt,
                });
            }

            competitorSummaries.push({
                id,
                name:
                    competitor.competitorName ||
                    competitor.competitorUrl,
                platform: competitor.platform,
                status: competitor.status,
                competitorUrl: competitor.competitorUrl,
                lastCheckedAt: competitor.lastCheckedAt,
                latestScanAt: latestSnapshot?.scannedAt || null,
                productCount: latestSnapshot?.productCount ?? 0,
                priceChanges: priceChanges.length,
                priceIncreases: priceChanges.filter(
                    (item) => item.direction === "increased"
                ).length,
                priceDecreases: priceChanges.filter(
                    (item) => item.direction === "decreased"
                ).length,
                newProducts: newProducts.length,
                removedProducts: removedProducts.length,
                successfulScans: successfulSnapshots.length,
                failedScans: competitorSnapshots.filter(
                    (item) => item.status === "failed"
                ).length,
            });
        }

        for (const snapshot of snapshots.slice(0, 20)) {
            const competitor = competitors.find(
                (item) => item.id.toString() ===
                    snapshot.competitorId.toString()
            );

            recentScans.push({
                id: snapshot._id.toString(),
                competitorId: snapshot.competitorId.toString(),
                competitorName:
                    competitor?.competitorName ||
                    competitor?.competitorUrl ||
                    "Unknown competitor",
                platform: snapshot.platform,
                scannedAt: snapshot.scannedAt,
                productCount: snapshot.productCount,
                status: snapshot.status,
                error: snapshot.error || null,
            });
        }

        allPriceChanges.sort(
            (a, b) =>
                Math.abs(b.changePercent ?? 0) -
                Math.abs(a.changePercent ?? 0)
        );

        competitorSummaries.sort(
            (a, b) => b.priceChanges - a.priceChanges
        );

        return res.status(200).json({
            success: true,
            generatedAt: new Date(),
            metrics,
            competitors: competitorSummaries,
            biggestPriceMovements: allPriceChanges.slice(0, 10),
            recentScans,
        });
    } catch (error) {
        console.error(
            "Get competitor dashboard failed:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "Failed to load competitor dashboard",
        });
    }
};

module.exports = { getCompetitorDashboard };
