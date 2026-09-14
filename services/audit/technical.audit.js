const auditTechnical = (crawlData) => {
    const issues = [];
    const strengths = [];

    const homepage = crawlData.homepage || {};
    const seo = homepage.seo || {};
    const structuredData = homepage.structuredData || {};

    const requestedUrl = crawlData.requestedUrl || "";
    const finalUrl = crawlData.finalUrl || "";

    // HTTPS
    try {
        const final = new URL(finalUrl || requestedUrl);

        if (final.protocol !== "https:") {
            issues.push({
                category: "Technical",
                severity: "high",
                issue: "Store is not using HTTPS",
                evidence:
                    `Final URL uses ${final.protocol}`
            });
        } else {
            strengths.push("Store is served over HTTPS.");
        }
    } catch {
        issues.push({
            category: "Technical",
            severity: "medium",
            issue: "Final URL could not be validated",
            evidence:
                "The crawler returned an invalid final URL."
        });
    }

    // Canonical
    if (!seo.canonical) {
        issues.push({
            category: "Technical",
            severity: "medium",
            issue: "Canonical URL is missing",
            evidence:
                "No canonical link was detected."
        });
    } else {
        strengths.push("Canonical URL is present.");
    }

    // Robots meta
    if (!seo.robots) {
        strengths.push(
            "No restrictive robots meta directive was detected."
        );
    } else {
        const robots = seo.robots.toLowerCase();

        if (
            robots.includes("noindex") ||
            robots.includes("nofollow")
        ) {
            issues.push({
                category: "Technical",
                severity: "high",
                issue: "Restrictive robots directive detected",
                evidence:
                    `Robots directive: ${seo.robots}`
            });
        } else {
            strengths.push(
                "Robots meta directive does not contain noindex/nofollow."
            );
        }
    }

    // Structured data
    if (!structuredData.count) {
        issues.push({
            category: "Technical",
            severity: "medium",
            issue: "No structured data detected",
            evidence:
                "No JSON-LD structured data blocks were found."
        });
    } else {
        strengths.push(
            `${structuredData.count} structured data block(s) detected.`
        );
    }

    // Redirect
    if (
        requestedUrl &&
        finalUrl &&
        requestedUrl.replace(/\/$/, "") !==
        finalUrl.replace(/\/$/, "")
    ) {
        strengths.push(
            "The store redirects the requested URL to a final URL."
        );
    }

    return {
        category: "Technical",
        issues,
        strengths
    };
};

module.exports = {
    auditTechnical
};