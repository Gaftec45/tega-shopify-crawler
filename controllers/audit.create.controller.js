const Audit = require("../models/audit.model");

const {
    processAudit
} = require("../services/audit/audit.processor");

const {
    validateStoreUrl
} = require("../utils/url.security");


const createAudit = async (req, res) => {

    try {

        const { storeUrl } = req.body;


        // --------------------------------
        // REQUIRED URL
        // --------------------------------

        if (!storeUrl) {

            return res.status(400).json({
                success: false,
                message: "storeUrl is required"
            });

        }


        // --------------------------------
        // URL SECURITY VALIDATION
        // --------------------------------

        const validation =
            await validateStoreUrl(
                storeUrl
            );


        if (!validation.valid) {

            return res.status(400).json({
                success: false,
                message:
                    validation.message
            });

        }


        const url =
            validation.url;


        // --------------------------------
        // CREATE AUDIT
        // --------------------------------

        const audit =
            await Audit.create({
                user: req.user.id,
                storeUrl:
                    url.toString(),

                requestedUrl:
                    url.toString(),

                status: "pending",

                progress: 0,

                currentStep: "queued"
            });


        console.log(
            `Audit created: ${audit._id}`
        );


        // --------------------------------
        // START BACKGROUND PROCESS
        // --------------------------------

        processAudit(
            audit._id
        ).catch((error) => {

            console.error(
                "Background audit error:",
                error
            );

        });


        // --------------------------------
        // RETURN IMMEDIATELY
        // --------------------------------

        return res.status(202).json({

            success: true,

            message:
                "Audit started successfully",

            auditId:
                audit._id,

            status:
                audit.status,

            progress:
                audit.progress,

            currentStep:
                audit.currentStep
        });


    } catch (error) {

        console.error(
            "Create audit error:",
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
    createAudit
};