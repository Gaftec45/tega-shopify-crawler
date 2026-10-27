
const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth.middleware");

const {
    getAuditById,
    getAuditReport,
    analyzeAudit,
    getUserAudits,
    createPublicReport,
    revokePublicReport
} = require("../controllers/audit.controller");

const {
    createAudit,
    createIntelAudit
} = require("../controllers/audit.create.controller");

const {
    saveAuditAsLead,
    getAuditLeadStatusController
} = require("../controllers/auditLeadController");
const {
    getIntelUsage,
} = require("../controllers/intelUsage.controller");

// ========================================
// CREATE MAIN TEGA SCOUT AUDIT
// POST /api/audits
// ========================================
router.post("/", auth, createAudit);

// ========================================
// CREATE TEGA SCOUT INTELLIGENCE AUDIT
// POST /api/audits/intel
// IMPORTANT: Keep this before router.get("/:id")
// ========================================
router.post("/intel", auth, createIntelAudit);

// GET /api/audits/intel/usage
router.get("/intel/usage", auth, getIntelUsage);

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

// ========================================
// CREATE PUBLIC REPORT
// POST /api/audits/:id/share
// ========================================
router.post("/:id/share", auth, createPublicReport);

// ========================================
// REVOKE PUBLIC REPORT
// DELETE /api/audits/:id/share
// ========================================
router.delete("/:id/share", auth, revokePublicReport);

// ========================================
// SAVE AUDIT AS LEAD
// POST /api/audits/:id/save-lead
// ========================================
router.post("/:id/save-lead", auth, saveAuditAsLead);

// ========================================
// GET AUDIT LEAD STATUS
// GET /api/audits/:id/lead-status
// ========================================
router.get("/:id/lead-status", auth, getAuditLeadStatusController);

module.exports = router;