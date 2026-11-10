
const axios = require("axios");

const ACTOR_ID = "mukeshrana90~shopify-store-scraper";

const APIFY_API = axios.create({
    baseURL: "https://api.apify.com/v2",
    timeout: 30000,
    headers: {
        Authorization: `Bearer ${process.env.APIFY_API_TOKEN}`,
        "Content-Type": "application/json"
    }
});

// ========================================
// VALIDATE CONFIGURATION
// ========================================

const validateConfig = () => {
    if (!process.env.APIFY_API_TOKEN) {
        throw new Error("APIFY_API_TOKEN is not configured");
    }
};

// ========================================
// BUILD ACTOR INPUT
// ========================================

const buildActorInput = ({
    query,
    maxItems = 10
}) => {
    if (!query || typeof query !== "string" || !query.trim()) {
        throw new Error("A valid search query is required");
    }

    const limit = Number(maxItems);

    if (!Number.isInteger(limit) || limit < 1 || limit > 20000) {
        throw new Error("maxItems must be between 1 and 20000");
    }

    return {
        providers: ["shopapp"],
        query: query.trim(),
        sortBy: "relevance",
        inStock: false,
        onSale: false,
        maxItems: limit,
        allowUnverifiedAge: false,
        requireEmail: false,
        requirePhone: false,
        requireAddress: false,
        usesAppsMatchAll: false,
        customThemeOnly: false,
        enrichCatalogue: true,
        enrichTechStack: true,
        enrichContactDetails: true,
        catalogPages: 2,
        contactPages: 3,
        skipPreviouslyScraped: false,
        resetSeenStores: false,
        includeRejected: false,
        keepUnverified: false,
        enrichmentConcurrency: 20,
        shopAppDelayMs: 400,
        ipRangeMaxPages: 10,
        serpMaxQueries: 3,
        proxyConfiguration: {
            useApifyProxy: true,
            apifyProxyGroups: ["RESIDENTIAL"]
        },
        storefrontProxyMode: "auto",
        allowResidentialStorefronts: true,
        maxResidentialMbytes: 150,
        maxCandidatesPerLead: 200
    };
};

// ========================================
// START ACTOR RUN
// ========================================

const startActor1Run = async (options) => {
    validateConfig();

    const input = buildActorInput(options);

    try {
        const response = await APIFY_API.post(
            `/acts/${ACTOR_ID}/runs`,
            input
        );

        const run = response.data.data;

        return {
            success: true,
            provider: "actor1",
            actorRunId: run.id,
            status: run.status,
            datasetId: run.defaultDatasetId,
            startedAt: run.startedAt,
            input
        };

    } catch (error) {
        console.error(
            "Actor 1 start error:",
            error.response?.data || error.message
        );

        throw new Error(
            error.response?.data?.error?.message ||
            "Failed to start Actor 1"
        );
    }
};

// ========================================
// GET ACTOR RUN STATUS
// ========================================

const getActor1Run = async (actorRunId) => {
    validateConfig();

    if (!actorRunId) {
        throw new Error("Actor run ID is required");
    }

    try {
        const response = await APIFY_API.get(
            `/actor-runs/${encodeURIComponent(actorRunId)}`
        );

        const run = response.data.data;

        return {
            provider: "actor1",
            actorRunId: run.id,
            status: run.status,
            datasetId: run.defaultDatasetId,
            startedAt: run.startedAt,
            finishedAt: run.finishedAt,
            stats: run.stats || null,
            exitCode: run.exitCode ?? null
        };

    } catch (error) {
        console.error(
            "Actor 1 status error:",
            error.response?.data || error.message
        );

        throw new Error(
            error.response?.data?.error?.message ||
            "Failed to retrieve Actor 1 run status"
        );
    }
};

// ========================================
// GET DATASET RESULTS
// ========================================

const getActor1Results = async ({
    datasetId,
    limit = 100,
    offset = 0
}) => {
    validateConfig();

    if (!datasetId) {
        throw new Error("Dataset ID is required");
    }

    try {
        const response = await APIFY_API.get(
            `/datasets/${encodeURIComponent(datasetId)}/items`,
            {
                params: {
                    clean: true,
                    format: "json",
                    limit,
                    offset
                }
            }
        );

        return {
            provider: "actor1",
            datasetId,
            count: response.data.length,
            items: response.data
        };

    } catch (error) {
        console.error(
            "Actor 1 dataset error:",
            error.response?.data || error.message
        );

        throw new Error(
            error.response?.data?.error?.message ||
            "Failed to retrieve Actor 1 dataset"
        );
    }
};

module.exports = {
    buildActorInput,
    startActor1Run,
    getActor1Run,
    getActor1Results
};