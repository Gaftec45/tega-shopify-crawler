const express = require("express");

const router = express.Router();

const auth = require("../middleware/auth.middleware");

const {
  getAuditById,
  getAuditReport,
  analyzeAudit,
  getUserAudits,
} = require("../controllers/audit.controller");

const {
  createAudit,
} = require("../controllers/audit.create.controller");


// ========================================
// CREATE NEW AUDIT
// POST /api/audits
// ========================================

router.post("/", auth, createAudit);


// ========================================
// GET LOGGED-IN USER'S AUDITS
// GET /api/audits/user
// ========================================

router.get("/user", auth, getUserAudits);


// ========================================
// GET SINGLE AUDIT
// GET /api/audits/:id
// ========================================

router.get("/:id", auth, getAuditById);


// ========================================
// START AI ANALYSIS
// POST /api/audits/:id/analyze
// ========================================

router.post("/:id/analyze", auth, analyzeAudit);


// ========================================
// GET AUDIT REPORT
// GET /api/audits/:id/report
// ========================================

router.get("/:id/report", auth, getAuditReport);


module.exports = router;