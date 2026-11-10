
const ShopifyDiscoveryRun = require("../../models/ShopifyDiscoveryRun");
const ShopifyLead = require("../../models/ShopifyLead");

const {
    startActor3Run,
    getActor3Run,
    getActor3Results
} = require("./providers/actor3.provider");

const { saveActor3Leads } = require("./lead.service");

const {
    reserveAuditCredits,
    settleAuditCredits,
    releaseAuditCredits
} = require("../main/mainApiService");

const TERMINAL_STATUSES = [
    "SUCCEEDED",
    "FAILED",
    "ABORTED",
    "TIMED-OUT"
];

const LEAD_PRICES = {
    storeProfile: 1,
    contactLead: 1,
    businessLead: 2,
    completeLead: 3
};

const createEmptyBreakdown = () => ({
    storeProfile: 0,
    contactLead: 0,
    businessLead: 0,
    completeLead: 0
});

const classifyLeadTier = (lead) => {
    const hasEmail =
        Array.isArray(lead.emails) &&
        lead.emails.length > 0;

    const hasPhone =
        Array.isArray(lead.phones) &&
        lead.phones.length > 0;

    const hasSocial =
        Array.isArray(lead.socialLinks) &&
        lead.socialLinks.length > 0;

    if (hasEmail && hasPhone && hasSocial) {
        return "completeLead";
    }

    if (hasEmail && hasPhone) {
        return "businessLead";
    }

    if (hasEmail || hasPhone) {
        return "contactLead";
    }

    return "storeProfile";
};

const calculateLeadCharge = (leads = []) => {
    const breakdown = createEmptyBreakdown();

    for (const lead of leads) {
        const tier = classifyLeadTier(lead);
        breakdown[tier] += 1;
    }

    const actualAmount =
        breakdown.storeProfile * LEAD_PRICES.storeProfile +
        breakdown.contactLead * LEAD_PRICES.contactLead +
        breakdown.businessLead * LEAD_PRICES.businessLead +
        breakdown.completeLead * LEAD_PRICES.completeLead;

    return {
        breakdown,
        actualAmount
    };
};

const getInsertedLeadsForDiscovery = async ({
    discoveryId,
    userId
}) => {
    return ShopifyLead.find({
        user: userId,
        discoveryRunId: discoveryId
    })
        .select("domain emails phones socialLinks")
        .lean();
};

const releaseDiscoveryReservation = async (
    discovery,
    reason
) => {
    if (
        !discovery.creditReservationId ||
        ["released", "settled"].includes(discovery.billingStatus)
    ) {
        return discovery;
    }

    try {
        await releaseAuditCredits({
            reservationId: discovery.creditReservationId,
            reason,
            userId: discovery.user.toString()
        });

        discovery.releasedCredits = discovery.reservedCredits;
        discovery.billingStatus = "released";
        discovery.billingError = null;

        await discovery.save();
    } catch (error) {
        discovery.billingError =
            error.response?.data?.message ||
            error.message ||
            "Unable to release credit reservation";

        await discovery.save();

        throw error;
    }

    return discovery;
};

const settleDiscoveryReservation = async (discovery) => {
    if (discovery.billingStatus === "settled") {
        return discovery;
    }

    if (!discovery.creditReservationId) {
        throw new Error("Discovery credit reservation is missing");
    }

    const insertedLeads = await getInsertedLeadsForDiscovery({
        discoveryId: discovery._id,
        userId: discovery.user
    });

    const {
        breakdown,
        actualAmount
    } = calculateLeadCharge(insertedLeads);

    if (actualAmount > discovery.reservedCredits) {
        throw new Error(
            "Calculated lead charge exceeds the reserved credit amount"
        );
    }

    await settleAuditCredits({
        reservationId: discovery.creditReservationId,
        actualAmount,
        userId: discovery.user.toString()
    });

    discovery.chargedCredits = actualAmount;
    discovery.releasedCredits =
        discovery.reservedCredits - actualAmount;

    discovery.leadBreakdown = breakdown;
    discovery.billingStatus = "settled";
    discovery.billingError = null;

    await discovery.save();

    return discovery;
};

const markDiscoveryFailed = async ({
    discovery,
    error,
    providerRun,
    releaseReservation = true
}) => {
    discovery.status = "failed";
    discovery.error = error.message || String(error);
    discovery.finishedAt = new Date();

    if (providerRun) {
        providerRun.status =
            providerRun.status === "aborted"
                ? "aborted"
                : "failed";

        providerRun.error = discovery.error;
        providerRun.finishedAt = new Date();
    }

    await discovery.save();

    if (releaseReservation) {
        await releaseDiscoveryReservation(
            discovery,
            discovery.error
        );
    }

    return discovery;
};

const startDiscovery = async ({
    userId,
    query,
    country = "US",
    maxItems = 50
}) => {
    if (!userId) {
        throw new Error("User ID is required");
    }

    if (!query || !query.trim()) {
        throw new Error("Search query is required");
    }

    const normalizedMaxItems = Number(maxItems);

    if (
        !Number.isInteger(normalizedMaxItems) ||
        normalizedMaxItems < 1 ||
        normalizedMaxItems > 1000
    ) {
        throw new Error(
            "maxItems must be a whole number between 1 and 1000"
        );
    }

    const normalizedCountry = String(country || "US")
        .trim()
        .toUpperCase();

    const discovery = await ShopifyDiscoveryRun.create({
        user: userId,
        providers: ["actor3"],
        query: query.trim(),
        country: normalizedCountry,
        maxItems: normalizedMaxItems,
        status: "pending",
        startedAt: new Date(),
        billingStatus: "not_started",
        providerRuns: [{
            provider: "actor3",
            status: "pending"
        }]
    });

    const reservationReference =
        `shopify-discovery-${discovery._id}`;

    // Maximum possible charge: 3 credits per lead.
    const reservedCredits =
        normalizedMaxItems * LEAD_PRICES.completeLead;

    // Reserve credits before starting Apify.
    try {
        const reservationResponse = await reserveAuditCredits({
            userId: userId.toString(),
            amount: reservedCredits,
            reference: reservationReference,
            feature: "shopify_finder",
            description: "Shopify Finder discovery reservation",
            metadata: {
                discoveryId: discovery._id.toString(),
                query: query.trim(),
                country: normalizedCountry,
                maxItems: normalizedMaxItems
            }
        });

        const reservation = reservationResponse.reservation;

        if (!reservation?.id) {
            throw new Error(
                "Credit reservation response did not contain a reservation ID"
            );
        }

        discovery.creditReservationId = reservation.id;
        discovery.reservedCredits = reservedCredits;
        discovery.billingStatus = "reserved";

        await discovery.save();
    } catch (error) {
        discovery.status = "failed";
        discovery.error =
            error.response?.data?.message ||
            error.message ||
            "Unable to reserve credits";

        discovery.finishedAt = new Date();

        await discovery.save();

        error.statusCode =
            error.response?.status ||
            error.statusCode;

        error.code =
            error.response?.data?.code ||
            error.code;

        error.availableCredits =
            error.response?.data?.availableCredits;

        error.requiredCredits =
            error.response?.data?.requiredCredits;

        throw error;
    }

    // Start Apify only after the reservation succeeds.
    try {
        const actorRun = await startActor3Run({
            query: query.trim(),
            maxItems: normalizedMaxItems,
            country: normalizedCountry
        });

        discovery.status = "running";

        discovery.providerRuns[0].actorRunId =
            actorRun.actorRunId;

        discovery.providerRuns[0].datasetId =
            actorRun.datasetId || null;

        discovery.providerRuns[0].status = "running";

        discovery.providerRuns[0].startedAt =
            actorRun.startedAt
                ? new Date(actorRun.startedAt)
                : new Date();

        await discovery.save();

        return discovery;
    } catch (error) {
        await markDiscoveryFailed({
            discovery,
            error,
            providerRun: discovery.providerRuns[0]
        });

        throw error;
    }
};

const refreshDiscovery = async ({
    discoveryId,
    userId
}) => {
    const discovery = await ShopifyDiscoveryRun.findOne({
        _id: discoveryId,
        user: userId
    });

    if (!discovery) {
        throw new Error("Discovery run not found");
    }

    const providerRun = discovery.providerRuns.find(
        item => item.provider === "actor3"
    );

    if (!providerRun) {
        throw new Error("Actor 3 provider run is missing");
    }

    // Fully completed and billed.
    if (
        ["completed", "partial"].includes(discovery.status) &&
        discovery.billingStatus === "settled"
    ) {
        return discovery;
    }

    // Retry a previously failed credit release.
    if (
        ["failed", "aborted"].includes(providerRun.status) &&
        discovery.billingStatus === "reserved"
    ) {
        await releaseDiscoveryReservation(
            discovery,
            providerRun.error || "Apify run failed"
        );

        return discovery;
    }

    // A failed/released discovery must not be polled again.
    if (
        ["failed", "aborted"].includes(providerRun.status) &&
        discovery.billingStatus === "released"
    ) {
        return discovery;
    }

    // Provider succeeded previously. Retry settlement only.
    if (providerRun.status === "succeeded") {
        await settleDiscoveryReservation(discovery);

        const isPartial = Boolean(providerRun.error);

        discovery.status = isPartial
            ? "partial"
            : "completed";

        discovery.finishedAt =
            discovery.finishedAt || new Date();

        await discovery.save();

        return discovery;
    }

    if (!providerRun.actorRunId) {
        throw new Error("Actor 3 run ID is missing");
    }

    try {
        const actorRun = await getActor3Run(
            providerRun.actorRunId
        );

        if (!TERMINAL_STATUSES.includes(actorRun.status)) {
            discovery.status = "running";
            await discovery.save();

            return discovery;
        }

        providerRun.datasetId =
            actorRun.datasetId || null;

        // Apify failed or was aborted.
        if (actorRun.status !== "SUCCEEDED") {
            providerRun.status =
                actorRun.status === "ABORTED"
                    ? "aborted"
                    : "failed";

            providerRun.error =
                `Apify run ended with status: ${actorRun.status}`;

            providerRun.finishedAt = new Date();

            discovery.totalFailed = 1;
            discovery.status = "failed";
            discovery.error = providerRun.error;
            discovery.finishedAt = new Date();

            await discovery.save();

            await releaseDiscoveryReservation(
                discovery,
                providerRun.error
            );

            return discovery;
        }

        if (!actorRun.datasetId) {
            throw new Error("Actor 3 returned no dataset ID");
        }

        const dataset = await getActor3Results({
            datasetId: actorRun.datasetId,
            limit: discovery.maxItems,
            offset: 0
        });

        const saveResult = await saveActor3Leads({
            items: dataset.items,
            userId,
            query: discovery.query,
            actorRunId: actorRun.actorRunId,
            discoveryId: discovery._id
        });

        // Persist provider success before attempting settlement.
        providerRun.status = "succeeded";
        providerRun.discovered = dataset.count;
        providerRun.saved = saveResult.saved;
        providerRun.finishedAt = new Date();

        // Store the partial-write error so a retry can
        // preserve the correct final discovery status.
        providerRun.error = saveResult.partialFailure
            ? saveResult.writeError || "Some leads could not be saved"
            : null;

        discovery.totalDiscovered = dataset.count;
        discovery.totalSaved = saveResult.saved;
        discovery.totalDuplicates = saveResult.duplicates;
        discovery.totalFailed = saveResult.skipped;

        if (saveResult.partialFailure) {
            discovery.error = providerRun.error;
        }

        // Keep running until billing settlement succeeds.
        discovery.status = "running";

        await discovery.save();

        // Charges only records inserted for this discovery.
        await settleDiscoveryReservation(discovery);

        discovery.status = saveResult.partialFailure
            ? "partial"
            : "completed";

        discovery.finishedAt = new Date();

        await discovery.save();

        return discovery;
    } catch (error) {
        // If provider success was already persisted, never release
        // the reservation. A later refresh can retry settlement.
        if (providerRun.status === "succeeded") {
            discovery.status = "running";

            discovery.billingError =
                error.response?.data?.message ||
                error.message ||
                "Credit settlement is pending";

            await discovery.save();

            throw error;
        }

        await markDiscoveryFailed({
            discovery,
            error,
            providerRun
        });

        throw error;
    }
};

const getDiscovery = async ({
    discoveryId,
    userId
}) => {
    return ShopifyDiscoveryRun.findOne({
        _id: discoveryId,
        user: userId
    });
};

module.exports = {
    startDiscovery,
    refreshDiscovery,
    getDiscovery,
    classifyLeadTier,
    calculateLeadCharge,
    LEAD_PRICES
};
