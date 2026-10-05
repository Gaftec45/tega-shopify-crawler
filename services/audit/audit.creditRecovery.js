const Audit = require("../../models/audit.model");

const {
    commitAuditCredits
} = require("../mainApiService");


const recoverPendingAuditCredits = async () => {

    console.log(
        "Checking for pending audit credit commits..."
    ); 

    const audits =
        await Audit.find({
            creditStatus: "commit_pending",
            creditReservationId: {
                $ne: null
            }
        }).limit(20);


    if (!audits.length) {

        console.log(
            "No pending credit commits found."
        );

        return {
            processed: 0,
            successful: 0,
            failed: 0
        };
    }


    let successful = 0;
    let failed = 0;


    for (const audit of audits) {

        try {

            console.log(
                `Recovering credit commit for audit: ${audit._id}`
            );


            await commitAuditCredits({

                reservationId:
                    audit.creditReservationId

            });


            audit.creditStatus =
                "committed";

            audit.status =
                "completed";

            audit.progress =
                100;

            audit.currentStep =
                "completed";

            audit.progressMessage =
                "Audit completed successfully.";

            audit.error =
                null;


            await audit.save();


            successful++;


            console.log(
                `Credit recovery successful: ${audit._id}`
            );


        } catch (error) {

            failed++;


            console.error(
                `Credit recovery failed for audit ${audit._id}:`,
                error
            );

        }

    }


    return {

        processed:
            audits.length,

        successful,

        failed

    };

};


module.exports = {
    recoverPendingAuditCredits
};