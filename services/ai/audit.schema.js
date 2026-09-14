const { z } = require("zod");

const issueSchema = z.object({
    title: z.string(),
    explanation: z.string(),
    evidence: z.string(),
    impact: z.string(),
    recommendation: z.string()
});

const opportunitySchema = z.object({
    title: z.string(),
    explanation: z.string(),
    impact: z.string(),
    recommendation: z.string()
});

const serviceSchema = z.object({
    service: z.string(),
    reason: z.string()
});

const aiAuditSchema = z.object({
    overallScore: z.number().min(0).max(100),

    summary: z.string(),

    criticalIssues: z.array(issueSchema),

    highPriorityIssues: z.array(issueSchema),

    mediumPriorityIssues: z.array(issueSchema),

    quickWins: z.array(opportunitySchema),

    growthOpportunities: z.array(opportunitySchema),

    recommendedServices: z.array(serviceSchema),

    outreachAngle: z.string()
});

module.exports = {
    aiAuditSchema
};