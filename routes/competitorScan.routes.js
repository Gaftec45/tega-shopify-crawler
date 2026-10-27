
const express = require("express");
const auth = require("../middleware/auth.middleware");
const { scanCompetitor } = require("../controllers/competitorScan.controller");

const router = express.Router();

router.post("/:competitorId/scan", auth, scanCompetitor);

module.exports = router;
