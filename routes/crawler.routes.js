const express = require("express");

const {
    startCrawler
} = require("../controllers/crawler.controller");
const auth = require("../middleware/auth.middleware");

const router = express.Router();

router.post("/", auth, startCrawler);

module.exports = router;