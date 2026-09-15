require("dotenv").config();

const express = require("express");
const cors = require("cors");

const connectDB = require("./config/db");
const PORT = process.env.PORT || 5001;

const healthRoutes = require("./routes/healthRoutes");
const crawlerRoutes = require("./routes/crawler.routes");
const productCrawlerRoutes = require("./routes/product.crawler.routes");
const auditRoutes = require("./routes/audit.routes");

const app = express();


// ========================================
// PROCESS START DIAGNOSTIC
// ========================================

console.log(
    `SERVER PROCESS STARTED | PID: ${process.pid} | ${new Date().toISOString()}`
);


// ========================================
// EXPRESS
// ========================================

app.use(cors({
    origin: [
        "http://localhost:3000",
        "https://tega-scout.vercel.app"
    ],
    methods: ["GET", "POST", "DELETE", "PUT"],
}));

app.use(express.json());

app.use(express.urlencoded({
    extended: true
}));


// ========================================
// ROUTES
// ========================================

app.use("/api/health", healthRoutes);

app.use("/api/crawler", crawlerRoutes);

app.use("/api/crawler/product", productCrawlerRoutes);

app.use("/api/audits", auditRoutes);


// ========================================
// 404
// ========================================

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "Route not found"
    });
});


// ========================================
// ERROR HANDLER
// ========================================

app.use((err, req, res, next) => {
    console.error(err);

    res.status(500).json({
        success: false,
        message: "Internal server error"
    });
});


// ========================================
// START SERVER
// ========================================

setInterval(() => {
    const memory = process.memoryUsage();

    console.log("MEMORY USAGE", {
        rss: `${Math.round(memory.rss / 1024 / 1024)} MB`,
        heapUsed: `${Math.round(memory.heapUsed / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(memory.heapTotal / 1024 / 1024)} MB`,
        external: `${Math.round(memory.external / 1024 / 1024)} MB`
    });
}, 10000);

const startServer = async () => {

    try {

        await connectDB();

        app.listen(PORT, () => {

            console.log(
                `AI Shopify Auditor running on port ${PORT}`
            );

            console.log(
                `Process PID: ${process.pid}`
            );

        });

    } catch (error) {

        console.error(
            "Failed to start server:"
        );

        console.error(
            error.message
        );

        process.exit(1);
    }
};

startServer();