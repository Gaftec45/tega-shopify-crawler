const severityWeights = {
    critical: 20,
    high: 12,
    medium: 6,
    low: 2
};


// ---------------------------------------------------------
// SEVERITY RANKING
// ---------------------------------------------------------

const severityRank = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4
};


// ---------------------------------------------------------
// GET HIGHEST SEVERITY
// ---------------------------------------------------------

const getHighestSeverity = (issues) => {
    return issues.reduce(
        (highest, issue) => {

            const currentRank =
                severityRank[issue.severity] || 0;

            const highestRank =
                severityRank[highest] || 0;

            return currentRank > highestRank
                ? issue.severity
                : highest;

        },
        "low"
    );
};


// ---------------------------------------------------------
// CREATE ISSUE GROUP KEY
// ---------------------------------------------------------

const getIssueGroupKey = (issue) => {
    return `${issue.category || "General"}::${issue.issue || "Unknown issue"}`;
};


// ---------------------------------------------------------
// CALCULATE GROUP PENALTY
// ---------------------------------------------------------

const calculateIssuePenalty = (issues) => {

    if (!issues.length) {
        return 0;
    }

    const highestSeverity =
        getHighestSeverity(issues);

    const basePenalty =
        severityWeights[highestSeverity] || 0;

    let penalty = 0;

    issues.forEach((issue, index) => {

        if (index === 0) {

            // Full penalty for first occurrence
            penalty += basePenalty;

        } else if (index === 1) {

            // 50% for second occurrence
            penalty += basePenalty * 0.5;

        } else if (index === 2) {

            // 25% for third occurrence
            penalty += basePenalty * 0.25;

        } else {

            // 10% for additional occurrences
            penalty += basePenalty * 0.1;
        }
    });

    return penalty;
};


// ---------------------------------------------------------
// CALCULATE CATEGORY SCORE
// ---------------------------------------------------------

const calculateCategoryScore = (audit) => {

    const issues =
        audit?.issues || [];

    if (issues.length === 0) {
        return 100;
    }


    // Group similar issues
    const groupedIssues = {};


    for (const issue of issues) {

        const key =
            getIssueGroupKey(issue);

        if (!groupedIssues[key]) {
            groupedIssues[key] = [];
        }

        groupedIssues[key].push(issue);
    }


    // Calculate total penalty
    let penalty = 0;


    for (
        const group of Object.values(groupedIssues)
    ) {

        penalty +=
            calculateIssuePenalty(group);
    }


    return Math.max(
        0,
        Math.min(
            100,
            Math.round(100 - penalty)
        )
    );
};


// ---------------------------------------------------------
// CALCULATE OVERALL SCORE
// ---------------------------------------------------------

const calculateOverallScore = (audits) => {

    const categories = {

        seo:
            calculateCategoryScore(
                audits.seo
            ),

        products:
            calculateCategoryScore(
                audits.products
            ),

        conversion:
            calculateCategoryScore(
                audits.conversion
            ),

        ux:
            calculateCategoryScore(
                audits.ux
            ),

        technical:
            calculateCategoryScore(
                audits.technical
            )
    };


    const overallScore =
        Math.round(
            (
                categories.seo +
                categories.products +
                categories.conversion +
                categories.ux +
                categories.technical
            ) / 5
        );


    // -----------------------------------------------------
    // ISSUE COUNTS
    // -----------------------------------------------------

    const allIssues =
        Object.values(audits)
            .flatMap(
                (audit) =>
                    audit?.issues || []
            );


    const issueCounts = {

        critical:
            allIssues.filter(
                (issue) =>
                    issue.severity === "critical"
            ).length,

        high:
            allIssues.filter(
                (issue) =>
                    issue.severity === "high"
            ).length,

        medium:
            allIssues.filter(
                (issue) =>
                    issue.severity === "medium"
            ).length,

        low:
            allIssues.filter(
                (issue) =>
                    issue.severity === "low"
            ).length
    };


    return {
        overallScore,
        categories,
        issueCounts
    };
};


module.exports = {
    calculateCategoryScore,
    calculateOverallScore
};