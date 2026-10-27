
const express = require("express");
const auth = require("../middleware/auth.middleware");
const {
    getCompetitorDashboard,
} = require("../controllers/competitorDashboard.controller");

const router = express.Router();

router.get("/dashboard", auth, getCompetitorDashboard);

module.exports = router;