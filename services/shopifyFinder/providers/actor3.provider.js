
const axios = require("axios");

const ACTOR_ID = "R9SL2PPdhdhLQwdck";

const APIFY_API = axios.create({
    baseURL: "https://api.apify.com/v2",
    timeout: 30000,
    headers: {
        Authorization: `Bearer ${process.env.APIFY_API_TOKEN}`,
        "Content-Type": "application/json"
    }
});

const validateConfig = () => {
    if (!process.env.APIFY_API_TOKEN) {
        throw new Error("APIFY_API_TOKEN is not configured");
    }
};

const buildActorInput = ({
    query,
    maxItems = 50,
    country = "US"
}) => {
    if (!query || typeof query !== "string" || !query.trim()) {
        throw new Error("A valid search query is required");
    }

    const limit = Number(maxItems);

    if (!Number.isInteger(limit) || limit < 1 || limit > 10000) {
        throw new Error("maxItems must be between 1 and 10000");
    }

    return {
        query: query.trim(),
        maxItems: limit,
        storeLocation: country.toUpperCase(),
        skipPreviouslyScraped: false
    };
};

const startActor3Run = async (options) => {
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
            provider: "actor3",
            actorRunId: run.id,
            status: run.status,
            datasetId: run.defaultDatasetId,
            startedAt: run.startedAt
        };
    } catch (error) {
        console.error(
            "Actor 3 start error:",
            error.response?.data || error.message
        );

        throw new Error(
            error.response?.data?.error?.message ||
            "Failed to start Actor 3"
        );
    }
};

const getActor3Run = async (actorRunId) => {
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
            provider: "actor3",
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
            "Actor 3 status error:",
            error.response?.data || error.message
        );

        throw new Error(
            error.response?.data?.error?.message ||
            "Failed to retrieve Actor 3 run status"
        );
    }
};

const getActor3Results = async ({
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
            provider: "actor3",
            datasetId,
            count: response.data.length,
            items: response.data
        };
    } catch (error) {
        console.error(
            "Actor 3 dataset error:",
            error.response?.data || error.message
        );

        throw new Error(
            error.response?.data?.error?.message ||
            "Failed to retrieve Actor 3 dataset"
        );
    }
};

module.exports = {
    buildActorInput,
    startActor3Run,
    getActor3Run,
    getActor3Results
};
