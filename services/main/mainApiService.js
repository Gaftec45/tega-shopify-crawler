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
    email,
}) => {
    const response = await mainAPI.get(
        "/internal/leads/status",
        {
            params: {
                userId,
                sourceAuditId,
                email,
            },
        }
    );

    return response.data;
};


const getVerifiedCompetitor = async ({ userId, competitorId }) => {
  const response = await mainAPI.get(
    `/internal/competitors/${encodeURIComponent(competitorId)}`,
    {
      params: { userId },
    }
  );

  return response.data.competitor;
};

const updateCompetitorLastCheckedAt = async ({
  userId,
  competitorId,
  lastCheckedAt,
}) => {
  const response = await mainAPI.patch(
    `/internal/competitors/${encodeURIComponent(
      competitorId
    )}/last-checked`,
    {
      userId,
      lastCheckedAt,
    }
  );

  return response.data;
};

const getVerifiedCompetitors = async ({ userId }) => {
    const response = await mainAPI.get("/internal/competitors", {
        params: { userId },
    });

    return response.data.competitors;
};

const checkIntelAnalysisQuota = async (authorization) => {
    if (!authorization || !authorization.startsWith("Bearer ")) {
        throw new Error("Missing authorization token");
    }

    const baseURL = MAIN_API_URL.replace(/\/+$/, "");

    const response = await axios.get(
        `${baseURL}/subscription/status`,
        {
            headers: {
                Authorization: authorization,
            },
            timeout: 15000,
        }
    );

    const data = response.data;

    if (
        !data ||
        data.productMode !== "intel" ||
        data.active !== true ||
        data.activated !== true
    ) {
        return {
            allowed: false,
            reason: "An active Intel subscription is required.",
        };
    }

    const limit = data.limits?.aiAnalysesPerMonth;
    const used = data.usage?.aiAnalyses?.used;
    const remaining = data.usage?.aiAnalyses?.remaining;

    // Fail closed if usage cannot be verified.
    if (
        typeof used !== "number" ||
        !Number.isFinite(used) ||
        used < 0
    ) {
        throw new Error("Intel analysis usage could not be verified");
    }

    if (
        limit !== null &&
        limit !== undefined &&
        (!Number.isFinite(limit) || limit < 0)
    ) {
        throw new Error("Intel analysis limit is invalid");
    }

    if (limit === 0 || (limit != null && used >= limit)) {
        return {
            allowed: false,
            reason: "Your Intel analysis limit has been reached.",
            used,
            limit,
            remaining: 0,
        };
    }

    return {
        allowed: true,
        reason: "Intel analysis is available.",
        used,
        limit: limit ?? null,
        remaining: remaining ?? (
            limit == null ? null : Math.max(0, limit - used)
        ),
    };
};

module.exports = {
    reserveAuditCredits,
    commitAuditCredits,
    releaseAuditCredits,
    createLeadFromAudit,
    getAuditLeadStatus,
    getVerifiedCompetitor,
    updateCompetitorLastCheckedAt,
    getVerifiedCompetitors,
    checkIntelAnalysisQuota,
};