
const normalizeUrl = (value) => {
    if (!value || typeof value !== "string") return null;

    try {
        const url = new URL(
            /^https?:\/\//i.test(value.trim())
                ? value.trim()
                : `https://${value.trim()}`
        );

        if (!["http:", "https:"].includes(url.protocol)) {
            return null;
        }

        // Always use HTTPS.
        url.protocol = "https:";

        // Remove URL fragments.
        url.hash = "";

        // Remove tracking parameters.
        const trackingParams = [
            "utm_source",
            "utm_medium",
            "utm_campaign",
            "utm_term",
            "utm_content",
            "user_id",
            "user_uuid"
        ];

        trackingParams.forEach(param => {
            url.searchParams.delete(param);
        });

        // Remove trailing slash while preserving profile paths.
        return url.toString().replace(/\/$/, "");

    } catch {
        return null;
    }
};


const getDomain = (item) => {
    const website = normalizeUrl(item?.websiteUrl);

    if (website) {
        return new URL(website).hostname
            .replace(/^www\./, "")
            .toLowerCase();
    }

    return item?.myshopifyDomain
        ?.trim()
        .toLowerCase()
        .replace(/^www\./, "") || null;
};


const normalizeEmail = (email) => {
    if (!email || typeof email !== "string") return null;

    const value = email.trim().toLowerCase();

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
        ? value
        : null;
};


const classifyEmail = (email) => {
    const local = email.split("@")[0].toLowerCase();

    const supportAddresses = [
        "support",
        "help",
        "customerservice",
        "customer.service",
        "customercare",
        "customer.care"
    ];

    const salesAddresses = [
        "sales",
        "business",
        "partnerships",
        "wholesale"
    ];

    const generalAddresses = [
        "hello",
        "info",
        "contact",
        "general",
        "office"
    ];

    if (supportAddresses.includes(local)) {
        return "support";
    }

    if (salesAddresses.includes(local)) {
        return "sales";
    }

    if (generalAddresses.includes(local)) {
        return "general";
    }

    return "other";
};


const normalizeContacts = (contacts = []) => {
    const emails = [];
    const phones = [];
    const socialLinks = [];

    const seenEmails = new Set();
    const seenPhones = new Set();
    const seenSocials = new Set();

    const socialPlatforms = [
        "facebook",
        "instagram",
        "youtube",
        "tiktok",
        "pinterest",
        "twitter",
        "x",
        "linkedin"
    ];

    const genericSocialHosts = {
        facebook: ["facebook.com"],
        instagram: ["instagram.com"],
        youtube: ["youtube.com", "youtu.be"],
        tiktok: ["tiktok.com"],
        pinterest: ["pinterest.com"],
        twitter: ["twitter.com", "x.com"],
        x: ["twitter.com", "x.com"],
        linkedin: ["linkedin.com"]
    };

    if (!Array.isArray(contacts)) {
        contacts = [];
    }

    for (const contact of contacts) {
        const method = contact?.method?.toLowerCase();
        const target = contact?.target?.trim();

        if (!target) continue;

        // EMAIL
        if (method === "email") {
            const email = normalizeEmail(target);

            if (email && !seenEmails.has(email)) {
                seenEmails.add(email);

                emails.push({
                    email,
                    type: classifyEmail(email),
                    source: "actor3"
                });
            }

            continue;
        }

        // PHONE
        if (method === "phone") {
            const phone = target.replace(/\s+/g, "");

            if (!seenPhones.has(phone)) {
                seenPhones.add(phone);
                phones.push(phone);
            }

            continue;
        }

        // SOCIAL LINKS
        if (socialPlatforms.includes(method)) {
            const url = normalizeUrl(target);

            if (!url) continue;

            let parsed;

            try {
                parsed = new URL(url);
            } catch {
                continue;
            }

            const hostname = parsed.hostname
                .toLowerCase()
                .replace(/^www\./, "");

            // Reject generic social network homepages.
            if (
                genericSocialHosts[method]?.includes(hostname) &&
                parsed.pathname === "/"
            ) {
                continue;
            }

            const platform = method === "x"
                ? "twitter"
                : method;

            const key = `${platform}:${url}`;

            if (!seenSocials.has(key)) {
                seenSocials.add(key);

                socialLinks.push({
                    platform,
                    url
                });
            }
        }
    }

    return {
        emails,
        phones,
        socialLinks
    };
};


const calculateLeadScore = ({
    website,
    emails = [],
    phones = [],
    address,
    socialLinks = [],
    products = []
}) => {
    let score = 0;

    if (website) score += 10;

    if (emails.length > 0) score += 35;

    if (phones.length > 0) score += 15;

    if (address?.country) score += 10;

    if (socialLinks.length > 0) score += 10;

    if (products.length > 0) score += 10;

    if (products.length >= 3) score += 10;

    return Math.min(score, 100);
};


const getQualification = (score) => {
    if (score >= 70) return "high";

    if (score >= 45) return "medium";

    if (score >= 20) return "low";

    return "unqualified";
};


const mapActor3Lead = (
    item,
    { userId, query, actorRunId }
) => {
    if (!userId) {
        throw new Error("User ID is required");
    }

    if (!item || typeof item !== "object") {
        return null;
    }

    const domain = getDomain(item);

    if (!domain) return null;

    const website = normalizeUrl(item.websiteUrl);

    const {
        emails,
        phones,
        socialLinks
    } = normalizeContacts(item.contacts);

    const products = (
        Array.isArray(item.sampleProducts)
            ? item.sampleProducts
            : []
    ).map(product => ({
        name: product.title || null,

        price: product.price != null
            ? `${product.currency || ""} ${product.price}`.trim()
            : null,

        url: normalizeUrl(product.url),

        image: product.imageUrl || null
    }));

    const score = calculateLeadScore({
        website,
        emails,
        phones,
        address: item.address,
        socialLinks,
        products
    });

    return {
        user: userId,

        storeName: item.name || null,

        providerStoreId: item.id
            ? String(item.id)
            : null,

        domain,

        storeUrl: website || `https://${domain}`,

        country: item.address?.country || null,

        category: query || null,

        provider: "actor3",

        actorRunId: actorRunId || null,

        searchQuery: query || null,

        emails,

        phones,

        socialLinks,

        productsCount: products.length,

        totalProductReviews: Number(
            item.totalProductReviews || 0
        ),

        totalProductRatings: Number(
            item.totalProductRatings || 0
        ),

        products,

        leadScore: score,

        qualification: getQualification(score),

        rawData: item,

        lastDiscoveredAt: new Date()
    };
};


module.exports = {
    mapActor3Lead,
    getDomain,
    normalizeContacts,
    calculateLeadScore,
    getQualification
};
