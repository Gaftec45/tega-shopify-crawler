
const axios = require("axios");

const MAIN_API_URL = process.env.MAIN_API_URL;

const getIntelSettings = async (authorization) => {
    if (!MAIN_API_URL) {
        throw new Error("MAIN_API_URL is not configured");
    }

    if (!authorization || !authorization.startsWith("Bearer ")) {
        throw new Error("Missing authorization token");
    }

    const response = await axios.get(
        `${MAIN_API_URL.replace(/\/+$/, "")}/intel/settings`,
        {
            headers: {
                Authorization: authorization,
            },
            timeout: 15000,
        }
    );

    if (!response.data?.success || !response.data?.settings) {
        throw new Error("Unable to retrieve Intel settings");
    }

    return response.data.settings;
};

module.exports = { getIntelSettings };