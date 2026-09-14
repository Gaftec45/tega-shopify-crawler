const auditUX = (homepage) => {
    const issues = [];
    const strengths = [];

    const signals = homepage?.signals || {};
    const links = homepage?.links || {};
    const buttons = homepage?.buttons || {};

    // Navigation links
    if (links.total === 0) {
        issues.push({
            category: "UX",
            severity: "high",
            issue: "No internal navigation links detected",
            evidence:
                "No homepage links were extracted."
        });
    } else {
        strengths.push(
            `${links.total} homepage links were detected.`
        );
    }

    // Email/contact
    if (!signals.hasEmailCapture && !signals.hasContactForm) {
        issues.push({
            category: "UX",
            severity: "medium",
            issue: "Limited customer contact options detected",
            evidence:
                "Neither an email capture form nor a contact form was detected on the homepage."
        });
    } else {
        strengths.push(
            "The homepage has a detectable contact or email-capture option."
        );
    }

    // CTA
    if (!signals.hasAddToCart && buttons.total === 0) {
        issues.push({
            category: "UX",
            severity: "high",
            issue: "No clear call-to-action detected",
            evidence:
                "No recognizable purchase CTA or button was detected on the homepage."
        });
    } else {
        strengths.push(
            "Call-to-action elements are present on the homepage."
        );
    }

    return {
        category: "UX",
        issues,
        strengths
    };
};

module.exports = {
    auditUX
};