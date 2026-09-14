const Audit = require("../../models/audit.model");

const {
    crawlHomepage
} = require("../crawler/crawlerService");

const {
    runAudit
} = require("./audit.engine");


// --------------------------------
// UPDATE AUDIT PROGRESS
// --------------------------------

const updateProgress = async (
    auditRecord,
    progress,
    currentStep
) => {
    auditRecord.progress = progress;
    auditRecord.currentStep = currentStep;

    await auditRecord.save();
};


// --------------------------------
// PROCESS AUDIT
// --------------------------------

const processAudit = async (auditId) => {

    const auditRecord =
        await Audit.findById(auditId);

    if (!auditRecord) {
        throw new Error("Audit not found");
    }

    try {

        console.log(
            `Starting background audit: ${auditId}`
        );


        // ========================================
        // STARTING
        // ========================================

        await updateProgress(
            auditRecord,
            5,
            "starting"
        );


        // ========================================
        // CRAWLING
        // ========================================

        auditRecord.status =
            "crawling";

        await updateProgress(
            auditRecord,
            10,
            "crawling_homepage"
        );


        console.log(
            `Crawling website: ${auditRecord.storeUrl}`
        );


        const crawlResult =
            await crawlHomepage(
                auditRecord.storeUrl
            );


        if (!crawlResult.success) {

            throw new Error(
                crawlResult.message ||
                "Website crawl failed"
            );
        }


        // ========================================
        // SAVE CRAWL DATA
        // ========================================

        auditRecord.crawl =
            crawlResult.data;

        auditRecord.finalUrl =
            crawlResult.data.finalUrl;

        auditRecord.storeName =
            crawlResult.data.storeName ||
            null;


        const productsFound =
            crawlResult.data.products?.crawled ||
            0;

        auditRecord.productsFound =
            productsFound;


        await updateProgress(
            auditRecord,
            50,
            "crawl_completed"
        );


        console.log(
            `Crawl completed: ${auditId}`
        );

        console.log(
            `Products crawled: ${productsFound}`
        );


        // ========================================
        // DETERMINISTIC ANALYSIS
        // ========================================

        auditRecord.status =
            "analyzing";


        await updateProgress(
            auditRecord,
            60,
            "analyzing"
        );


        console.log(
            `Running deterministic audit: ${auditId}`
        );


        const audit =
            runAudit(
                crawlResult.data
            );


        auditRecord.deterministicAudit =
            audit;

        auditRecord.score =
            audit.score;


        await updateProgress(
            auditRecord,
            90,
            "analysis_completed"
        );


        console.log(
            `Deterministic audit completed: ${auditId}`
        );


        // ========================================
        // CRAWL / ANALYSIS COMPLETE
        // ========================================

        auditRecord.status =
            "crawled";

        auditRecord.progress =
            100;

        auditRecord.currentStep =
            "ready_for_ai";

        auditRecord.error =
            null;


        await auditRecord.save();


        console.log(
            `Crawl and deterministic audit completed: ${auditId}`
        );


    } catch (error) {

        console.error(
            `Audit ${auditId} failed:`,
            error
        );


        auditRecord.status =
            "failed";

        auditRecord.currentStep =
            "failed";

        auditRecord.error =
            error.message;


        await auditRecord.save();

    }
};


module.exports = {
    processAudit
};