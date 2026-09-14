const Audit = require("../models/audit.model");

const mongoose = require("mongoose");

const { processAudit } = require("../services/audit/audit.processor");


const startCrawler = async (req, res) => {
    try {

        const { storeUrl } = req.body;


        // --------------------------------
        // VALIDATE URL
        // --------------------------------

        if (!storeUrl) {
            return res.status(400).json({
                success: false,
                message: "storeUrl is required"
            });
        }


        let url;

        try {
            url = new URL(storeUrl);
        } catch {
            return res.status(400).json({
                success: false,
                message: "Invalid URL"
            });
        }


        if (
            !["http:", "https:"].includes(
                url.protocol
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Only HTTP and HTTPS URLs are allowed"
            });
        }


        // --------------------------------
        // CREATE AUDIT
        // --------------------------------

        const audit = await Audit.create({
            user: req.user._id,
            storeUrl: url.toString(),
            requestedUrl: url.toString(),
            status: "pending",
            progress: 0,
            currentStep: "queued",
            error: null
        });


        console.log(
            `Audit created: ${audit._id}`
        );


        // --------------------------------
        // START BACKGROUND PROCESS
        // --------------------------------

        processAudit(audit._id).catch(
            async (error) => {

                console.error(
                    `Background audit error ${audit._id}:`,
                    error
                );

                try {

                    await Audit.findByIdAndUpdate(
                        audit._id,
                        {
                            status: "failed",

                            currentStep: "failed",

                            error:
                                error.message
                        }
                    );

                } catch (saveError) {

                    console.error(
                        "Failed to save background audit error:",
                        saveError
                    );
                }
            }
        );


        // --------------------------------
        // RESPONSE
        // --------------------------------

        return res.status(202).json({

            success: true,

            message:
                "Audit started successfully",

            auditId: audit._id,

            status: audit.status,

            progress: audit.progress,

            currentStep:
                audit.currentStep
        });


    } catch (error) {

        console.error(
            "Start crawler error:",
            error
        );


        return res.status(500).json({

            success: false,

            message:
                "Failed to start audit",

            error:
                error.message
        });
    }
};


module.exports = {
    startCrawler
};