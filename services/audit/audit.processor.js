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
    currentStep,
    message = null
) => {
    auditRecord.progress =
        Math.min(
            100,
            Math.max(
                0,
                Number(progress) || 0
            )
        );

    auditRecord.currentStep =
        currentStep;

    if (message !== null) {
        auditRecord.progressMessage =
            message;
    }

    await auditRecord.save();
};


// --------------------------------
// PROCESS AUDIT
// --------------------------------

const processAudit = async (auditId) => {

    const auditRecord =
        await Audit.findById(auditId);

    if (!auditRecord) {
        throw new Error(
            "Audit not found"
        );
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
            "starting",
            "Preparing your store audit..."
        );


        // ========================================
        // CRAWLING
        // ========================================

        auditRecord.status =
            "crawling";

        await auditRecord.save();


        await updateProgress(
            auditRecord,
            10,
            "crawling_homepage",
            "Opening Shopify store..."
        );


        console.log(
            `Crawling website: ${auditRecord.storeUrl}`
        );


        // ========================================
        // CRAWL WEBSITE
        // ========================================

        const crawlResult =
            await crawlHomepage(
                auditRecord.storeUrl,

                async (
                    progress,
                    currentStep,
                    message
                ) => {

                    await updateProgress(
                        auditRecord,
                        progress,
                        currentStep,
                        message
                    );
                }
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
            crawlResult.data.finalUrl || null;

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
            45,
            "crawl_completed",
            "Store crawl completed successfully."
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

        await auditRecord.save();


        await updateProgress(
            auditRecord,
            50,
            "analyzing",
            "Running store analysis..."
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
            68,
            "analysis_completed",
            "Store analysis completed."
        );


        console.log(
            `Deterministic audit completed: ${auditId}`
        );


        // ========================================
        // READY FOR AI
        // ========================================

        auditRecord.status =
            "crawled";

        auditRecord.progress =
            70;

        auditRecord.currentStep =
            "ready_for_ai";

        auditRecord.progressMessage =
            "Your store audit is ready for AI analysis.";

        auditRecord.error =
            null;


        /*
         * IMPORTANT:
         *
         * Do NOT set progress to 100 here.
         *
         * The AI stage still needs to run.
         */

        await auditRecord.save();


        console.log(
            `Crawl and deterministic audit completed: ${auditId}`
        );

        console.log(
            `Audit ready for AI analysis: ${auditId}`
        );


    } catch (error) {

        console.error(
            `Audit ${auditId} failed:`,
            error
        );


        // ========================================
        // AUDIT FAILED
        // ========================================

        auditRecord.status =
            "failed";

        auditRecord.progress =
            Math.min(
                100,
                Math.max(
                    0,
                    Number(auditRecord.progress) || 0
                )
            );

        auditRecord.currentStep =
            "failed";

        auditRecord.progressMessage =
            "We couldn't complete the store audit.";

        auditRecord.error =
            error.message;


        await auditRecord.save();

    }
};


module.exports = {
    processAudit
};