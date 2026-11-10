
const express = require("express");

const auth = require("../middleware/auth.middleware");

const {
    startShopifyDiscovery,
    refreshShopifyDiscovery,
    getShopifyDiscovery,
    getShopifyLeads
} = require("../controllers/shopifyFinder.controller");

const router = express.Router();

// All Shopify Finder endpoints require authentication.
router.use(auth);

// Start a new store discovery
router.post("/discoveries", startShopifyDiscovery);

// Refresh an Apify run and save its results when complete
router.post("/discoveries/:discoveryId/refresh", refreshShopifyDiscovery);

// Get a discovery run
router.get("/discoveries/:discoveryId", getShopifyDiscovery);

// Get the user's saved leads
router.get("/leads", getShopifyLeads);

module.exports = router;