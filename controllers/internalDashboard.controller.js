
const mongoose = require("mongoose");

const ShopifyLead = require("../models/ShopifyLead");
const ShopifyDiscoveryRun = require("../models/ShopifyDiscoveryRun");
const Audit = require("../models/audit.model");

const getDashboardStats = async (req, res) => {
    try {
        const { userId } = req.params;

        // Validate user ID
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid user ID."
            });
        }

        const objectUserId = new mongoose.Types.ObjectId(userId);

        // Fetch dashboard statistics concurrently
        const [
            businesses,
            discoveryRuns,
            totalAudits,
            completedAudits
        ] = await Promise.all([
            ShopifyLead.countDocuments({
                user: objectUserId
            }),

            ShopifyDiscoveryRun.countDocuments({
                user: objectUserId
            }),

            Audit.countDocuments({
                user: objectUserId,
                productMode: "main"
            }),

            Audit.countDocuments({
                user: objectUserId,
                productMode: "main",
                status: "completed"
            })
        ]);

        return res.status(200).json({
            success: true,
            data: {
                scouting: {
                    businesses,
                    discoveryRuns
                },

                audits: {
                    total: totalAudits,
                    completed: completedAudits
                }
            }
        });

    } catch (error) {
        console.error(
            "Internal dashboard stats error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve dashboard statistics."
        });
    }
};

module.exports = {
    getDashboardStats
};