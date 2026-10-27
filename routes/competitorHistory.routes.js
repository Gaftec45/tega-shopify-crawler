
const express = require("express");
const auth = require("../middleware/auth.middleware");
const {
  getCompetitorHistory,
} = require("../controllers/competitorHistory.controller");

const router = express.Router();

router.get("/:competitorId/history", auth, getCompetitorHistory);

module.exports = router;
