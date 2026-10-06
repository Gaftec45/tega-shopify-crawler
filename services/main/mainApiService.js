const axios = require("axios");

const MAIN_API_URL =
    process.env.MAIN_API_URL;

const INTERNAL_API_KEY =
    process.env.TEGASCOUT_INTERNAL_API_KEY;

if (!MAIN_API_URL) {
    throw new Error(
        "MAIN_API_URL is not configured"
    );
}

if (
    !INTERNAL_API_KEY ||
    INTERNAL_API_KEY ===
        "YOUR_LONG_RANDOM_SECRET"
) {
    throw new Error(
        "TEGASCOUT_INTERNAL_API_KEY is not configured correctly"
    );
}

const mainAPI = axios.create({
    baseURL: MAIN_API_URL,
    timeout: 15000,
    headers: {
        "Content-Type": "application/json",
        "x-internal-api-key":
            INTERNAL_API_KEY,
    },
});

const reserveAuditCredits = async ({
    userId,
    amount,
    reference,
    feature,
    description,
    metadata = {},
}) => {
    const response =
        await mainAPI.post(
            "/internal/credits/reserve",
            {
                userId,
                amount,
                feature,
                reference,
                description,
                metadata,
            }
        );

    return response.data;
};

const commitAuditCredits = async ({
    reservationId,
}) => {
    const response =
        await mainAPI.post(
            "/internal/credits/commit",
            {
                reservationId,
            }
        );

    return response.data;
};

const releaseAuditCredits = async ({
    reservationId,
    reason,
}) => {
    const response =
        await mainAPI.post(
            "/internal/credits/release",
            {
                reservationId,
                reason,
            }
        );

    return response.data;
};


const createLeadFromAudit = async ({
  userId,
  name,
  email,
  company,
  storeUrl,
  sourceAuditId,
  auditScore,
  problems,
  opportunities,
  recommendedServices,
  outreachAngle
}) => {
  const response = await axios.post(
    `${MAIN_API_URL}/internal/leads`,
    {
      userId,
      name,
      email,
      company,
      storeUrl,
      source: 'audit',
      sourceAuditId,
      auditScore,
      problems,
      opportunities,
      recommendedServices,
      outreachAngle
    },
    {
      headers: {
        'x-internal-api-key': INTERNAL_API_KEY
      },
      timeout: 15000
    }
  )

  return response.data
}

const getAuditLeadStatus = async ({
    userId,
    sourceAuditId,
}) => {
    const response = await mainAPI.get(
        "/internal/leads/status",
        {
            params: {
                userId,
                sourceAuditId,
            },
        }
    );

    return response.data;
};

module.exports = {
    reserveAuditCredits,
    commitAuditCredits,
    releaseAuditCredits,
    createLeadFromAudit,
    getAuditLeadStatus,
};