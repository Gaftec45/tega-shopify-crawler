const express = require("express");

const {
    crawlProduct
} = require("../controllers/product.crawler.controller");

const router = express.Router();

router.post("/", crawlProduct);

module.exports = router;