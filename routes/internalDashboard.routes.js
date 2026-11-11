const express = require("express");

const internalDashboardAuth = require("../middleware/internalDashboardAuth");

const {
    getDashboardStats
} = require("../controllers/internalDashboard.controller");

const router = express.Router();

router.get(
    "/dashboard-stats/:userId",
    internalDashboardAuth,
    getDashboardStats
);

module.exports = router;