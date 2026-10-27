const Audit = require("../models/audit.model");

const getIntelUsage = async (req, res) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        // Current calendar month in UTC.
        const now = new Date();

        const periodStart = new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            1
        ));

        const periodEnd = new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth() + 1,
            1
        ));

        const used = await Audit.countDocuments({
            user: userId,
            productMode: "intel",
            status: "completed",
            aiCompletedAt: {
                $gte: periodStart,
                $lt: periodEnd,
            },
            aiAudit: {
                $exists: true,
                $ne: null,
            },
        });

        return res.status(200).json({
            success: true,
            used,
            periodStart,
            periodEnd,
        });
    } catch (error) {
        console.error("Intel usage error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve Intel AI usage",
        });
    }
};

module.exports = { getIntelUsage };