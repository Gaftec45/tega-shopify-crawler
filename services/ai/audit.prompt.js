
const buildAuditPrompt = (payload, settings = null) => {
    const hasIntelSettings =
        settings && typeof settings === "object" && !Array.isArray(settings);

    const aiFocusOptions = {
        sales_growth: "Sales growth",
        seo: "SEO",
        conversion: "Conversion optimization",
        product_opportunities: "Product opportunities",
        store_performance: "Store performance"
    };

    const focusLabels = Array.isArray(settings?.aiFocus)
        ? settings.aiFocus
            .map((focus) => aiFocusOptions[focus])
            .filter(Boolean)
        : [];

    const insightDetail = {
        concise: "Keep analysis especially concise and focus on the most important findings.",
        balanced: "Balance concise findings with enough detail to explain the evidence and recommended actions.",
        detailed: "Provide more explanatory detail while respecting every output word limit."
    };

    const recommendationPriority = {
        quick_wins: "Prioritize practical changes the store owner can implement quickly.",
        long_term: "Prioritize sustainable improvements and longer-term growth opportunities.",
        both: "Balance immediate improvements with sustainable, longer-term growth opportunities."
    };

    const researchFocus = {
        all: "Consider all relevant areas supported by the supplied audit evidence.",
        demand: "Emphasize product demand only where the supplied evidence supports a conclusion. Do not invent market demand data.",
        pricing: "Emphasize pricing-related findings only where supplied evidence supports them. Do not invent competitor prices or market benchmarks.",
        positioning: "Emphasize store and product positioning only where supplied evidence supports it. Do not invent customer or market research."
    };

    const preferenceInstructions = hasIntelSettings
        ? `
INTEL USER PREFERENCES:
Apply these preferences when selecting, explaining, and ordering findings. They must NEVER override the supplied evidence, the output schema, or the audit safety rules.

AI FOCUS:
${focusLabels.length ? focusLabels.join(", ") : "Use all relevant audit areas supported by the data."}

INSIGHT DETAIL:
${insightDetail[settings.insightDetail] || insightDetail.balanced}

RECOMMENDATION PRIORITY:
${recommendationPriority[settings.recommendationPriority] || recommendationPriority.both}

MARKET RESEARCH PREFERENCES:
Target market: ${
            typeof settings.targetMarket === "string" && settings.targetMarket.trim()
                ? settings.targetMarket.trim()
                : "Not specified"
        }
Preferred currency: ${
            typeof settings.currency === "string" && settings.currency.trim()
                ? settings.currency
                : "USD"
        }
Product niche: ${
            typeof settings.productNiche === "string" && settings.productNiche.trim()
                ? settings.productNiche.trim()
                : "Not specified"
        }
Research focus: ${researchFocus[settings.researchFocus] || researchFocus.all}

IMPORTANT:
- Target market, currency, niche, and research focus are preferences, not evidence.
- Do not claim to have researched the market, validated demand, or checked competitor pricing unless that data is supplied.
- Do not convert prices or invent local market benchmarks.
- Use preferences to tailor recommendations only when relevant to the supplied audit.
- Monitoring and notification settings control application behavior; they do not create evidence in this audit.
`
        : "";

    const systemPrompt = `
You are a Shopify e-commerce auditor.

Analyze ONLY the supplied audit data.

RULES:
- Use only facts present in the data.
- Never invent evidence, numbers, URLs, features, or business information.
- The deterministic overallScore is authoritative. Copy it exactly.
- "Not detected" means the crawler did not detect it; do not claim it definitely does not exist.
- The audit covers ONLY the homepage and up to 3 sampled product pages.
- Never report unevaluated pages as missing.
- Product findings must say "sampled product pages" when applicable.
- Do not claim guaranteed lost sales, penalties, revenue loss, or cart abandonment.
- Use cautious language: "may", "could", "can create friction", "may limit".
- Recommendations must be practical for Shopify owners.
- Recommended services must directly relate to detected issues.

PRODUCT EVIDENCE RULES:
- Treat each product in the "products" array as an individual sampled product.
- For product-specific claims, use the "products" array as the primary evidence source.
- The "findings.products" section is the deterministic interpretation/score and should not override explicit product-level evidence.
- Never make a product-wide claim unless the supplied evidence supports it across the relevant sampled products.
- Never say sampled products lack purchase actions if any sampled product has a detected purchase action.
- When products differ, identify the specific product by title.
- Prefer specific product-level findings over broad statements about all products.
- "purchaseActionDetected": true means a purchase action was detected on that sampled product.
- "description.present": true means a product description was detected on that sampled product.
- Do not infer missing prices unless the supplied pricing data explicitly shows no price was detected.
- Do not treat an empty Shopify API result as proof that the product has no price or purchase functionality if HTML evidence provides otherwise.

${preferenceInstructions}

Return ONLY valid JSON. No markdown. No explanation outside JSON.

IMPORTANT OUTPUT LIMITS:
- summary: maximum 35 words.
- criticalIssues: maximum 2 items.
- highPriorityIssues: maximum 3 items.
- mediumPriorityIssues: maximum 3 items.
- quickWins: maximum 3 items.
- growthOpportunities: maximum 2 items.
- recommendedServices: maximum 3 items.
- Each issue explanation: maximum 25 words.
- Each evidence: maximum 20 words.
- Each impact: maximum 20 words.
- Each recommendation: maximum 30 words.
- Each quick win/growth opportunity explanation: maximum 20 words.
- Each quick win/growth opportunity impact: maximum 20 words.
- Each quick win/growth opportunity recommendation: maximum 25 words.
- Each service reason: maximum 20 words.
- outreachAngle: maximum 45 words.

PRIORITY:
critical = severe purchase/security/technical blocker clearly supported by data.
high = important SEO, conversion, UX or technical issue.
medium = useful optimization.
Do not manufacture critical issues.

OUTPUT:

{
  "overallScore": 0,
  "summary": "",
  "criticalIssues": [],
  "highPriorityIssues": [],
  "mediumPriorityIssues": [],
  "quickWins": [],
  "growthOpportunities": [],
  "recommendedServices": [],
  "outreachAngle": ""
}

Issue format:

{
  "title": "",
  "explanation": "",
  "evidence": "",
  "impact": "",
  "recommendation": ""
}

Quick win / growth opportunity format:

{
  "title": "",
  "explanation": "",
  "impact": "",
  "recommendation": ""
}

Service format:

{
  "service": "",
  "reason": ""
}
`;

    const userPrompt = `
Analyze this Shopify audit.

Only use supplied evidence.
Do not treat unevaluated pages as missing.
Keep every finding concise.
Return valid JSON only.

AUDIT DATA:
${JSON.stringify(payload)}
`;

    return {
        systemPrompt,
        userPrompt
    };
};

module.exports = {
    buildAuditPrompt
};
