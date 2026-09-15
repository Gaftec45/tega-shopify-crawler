const express = require("express");

const router = express.Router();

const {
    getPublicReport
} = require("../controllers/audit.controller");


// ========================================
// GET PUBLIC AUDIT REPORT
// GET /api/public-reports/:token
// ========================================

router.get(
    "/:token",
    getPublicReport
);


module.exports = router;