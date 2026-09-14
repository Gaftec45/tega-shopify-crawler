const auditSEO = (homepage) => {
    const issues = [];
    const strengths = [];

    const seo = homepage.seo || {};
    const headings = homepage.headings || {};
    const images = homepage.images || {};

    // -----------------------------
    // TITLE
    // -----------------------------

    if (!seo.title) {
        issues.push({
            category: "SEO",
            severity: "high",
            issue: "Missing page title",
            evidence: "No <title> tag was detected."
        });
    } else if (seo.titleLength < 30) {
        issues.push({
            category: "SEO",
            severity: "medium",
            issue: "Page title is too short",
            evidence:
                `Title length is ${seo.titleLength} characters.`
        });
    } else if (seo.titleLength > 60) {
        issues.push({
            category: "SEO",
            severity: "medium",
            issue: "Page title may be too long",
            evidence:
                `Title length is ${seo.titleLength} characters.`
        });
    } else {
        strengths.push(
            "Page title has a reasonable length."
        );
    }

    // -----------------------------
    // META DESCRIPTION
    // -----------------------------

    if (!seo.metaDescription) {
        issues.push({
            category: "SEO",
            severity: "high",
            issue: "Missing meta description",
            evidence:
                "No meta description was detected."
        });
    } else if (seo.metaDescriptionLength < 70) {
        issues.push({
            category: "SEO",
            severity: "medium",
            issue: "Meta description is short",
            evidence:
                `Meta description is ${seo.metaDescriptionLength} characters.`
        });
    } else if (seo.metaDescriptionLength > 160) {
        issues.push({
            category: "SEO",
            severity: "medium",
            issue: "Meta description may be too long",
            evidence:
                `Meta description is ${seo.metaDescriptionLength} characters.`
        });
    } else {
        strengths.push(
            "Meta description has a reasonable length."
        );
    }

    // -----------------------------
    // H1
    // -----------------------------

    const h1Count = headings.h1?.length || 0;

    if (h1Count === 0) {
        issues.push({
            category: "SEO",
            severity: "high",
            issue: "No H1 heading detected",
            evidence:
                "The homepage contains no H1 element."
        });
    } else if (h1Count > 1) {
        issues.push({
            category: "SEO",
            severity: "medium",
            issue: "Multiple H1 headings detected",
            evidence:
                `The homepage contains ${h1Count} H1 headings.`
        });
    } else {
        strengths.push(
            "Homepage contains a single H1 heading."
        );
    }

    // -----------------------------
    // CANONICAL
    // -----------------------------

    if (!seo.canonical) {
        issues.push({
            category: "SEO",
            severity: "medium",
            issue: "Missing canonical URL",
            evidence:
                "No canonical link was detected."
        });
    } else {
        strengths.push(
            "Canonical URL is present."
        );
    }

    // -----------------------------
    // IMAGES
    // -----------------------------

    if (
        images.total > 0 &&
        images.withoutAlt > 0
    ) {
        const missingAltPercentage =
            (images.withoutAlt / images.total) * 100;

        let severity = "low";

        if (missingAltPercentage > 30) {
            severity = "high";
        } else if (missingAltPercentage > 10) {
            severity = "medium";
        }

        issues.push({
            category: "SEO",
            severity,
            issue: "Images are missing alt text",
            evidence:
                `${images.withoutAlt} of ${images.total} images have no alt text (${missingAltPercentage.toFixed(1)}%).`
        });
    } else if (images.total > 0) {
        strengths.push(
            "Images have alt text."
        );
    }

    // -----------------------------
    // OPEN GRAPH
    // -----------------------------

    const openGraph = homepage.openGraph || {};

    if (!openGraph.title) {
        issues.push({
            category: "SEO",
            severity: "low",
            issue: "Missing Open Graph title",
            evidence:
                "og:title was not detected."
        });
    }

    if (!openGraph.description) {
        issues.push({
            category: "SEO",
            severity: "low",
            issue: "Missing Open Graph description",
            evidence:
                "og:description was not detected."
        });
    }

    if (!openGraph.image) {
        issues.push({
            category: "SEO",
            severity: "low",
            issue: "Missing Open Graph image",
            evidence:
                "og:image was not detected."
        });
    }

    // -----------------------------
    // STRUCTURED DATA
    // -----------------------------

    const structuredData =
        homepage.structuredData || {};

    if (!structuredData.count) {
        issues.push({
            category: "SEO",
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

    return {
        category: "SEO",
        issues,
        strengths
    };
};

module.exports = {
    auditSEO
};