const Audit = require('../models/audit.model');
const { createLeadFromAudit, getAuditLeadStatus } = require('../services/main/mainApiService');


const saveAuditAsLead = async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.id

    const audit = await Audit.findOne({
      _id: id,
      user: userId
    }).lean()

    if (!audit) {
      return res.status(404).json({
        success: false,
        message: 'Audit not found'
      })
    }

    if (!audit.isUnlocked) {
      return res.status(403).json({
        success: false,
        code: 'AUDIT_LOCKED',
        message: 'Unlock the full audit before saving this lead.'
      })
    }

    const primaryEmail =
      audit.contact?.primaryEmail ||
      audit.contact?.emails?.[0]?.email

    if (!primaryEmail) {
      return res.status(400).json({
        success: false,
        code: 'NO_CONTACT_EMAIL',
        message: 'No contact email was found for this store.'
      })
    }

    const ai = audit.aiAudit || {}

    const problems = [
      ...(Array.isArray(ai.criticalIssues)
        ? ai.criticalIssues
        : []),

      ...(Array.isArray(ai.highPriorityIssues)
        ? ai.highPriorityIssues
        : []),

      ...(Array.isArray(ai.mediumPriorityIssues)
        ? ai.mediumPriorityIssues
        : [])
    ].map(issue => issue.title)

    const opportunities = [
      ...(Array.isArray(ai.quickWins)
        ? ai.quickWins
        : []),

      ...(Array.isArray(ai.growthOpportunities)
        ? ai.growthOpportunities
        : [])
    ].map(item => item.title)

    const recommendedServices =
      Array.isArray(ai.recommendedServices)
        ? ai.recommendedServices.map(
            item => item.service
          )
        : []

    const result = await createLeadFromAudit({
      userId,
      name: audit.storeName || '',
      email: primaryEmail,
      company: audit.storeName || '',
      storeUrl:
        audit.finalUrl ||
        audit.storeUrl ||
        audit.requestedUrl ||
        '',

      sourceAuditId: audit._id.toString(),

      auditScore:
        typeof ai.overallScore === 'number'
          ? ai.overallScore
          : null,

      problems,
      opportunities,
      recommendedServices,

      outreachAngle:
        ai.outreachAngle || ''
    })

    return res.status(201).json(result)

  } catch (error) {
    console.error(
      'Save audit as lead error:',
      error.response?.data || error.message
    )

    if (error.response?.status === 409) {
      return res.status(409).json({
        success: false,
        code: 'LEAD_EXISTS',
        message: 'This store is already saved as a lead.',
        lead: error.response.data?.lead || null
      })
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to save audit as lead'
    })
  }
}


const getAuditLeadStatusController = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const audit = await Audit.findOne({
            _id: id,
            user: userId,
        }).select("_id");

        if (!audit) {
            return res.status(404).json({
                success: false,
                message: "Audit not found",
            });
        }

        const result = await getAuditLeadStatus({
            userId,
            sourceAuditId: id,
        });

        return res.status(200).json({
            success: true,
            saved: result?.saved === true,
            leadId: result?.leadId || null,
        });
    } catch (error) {
        console.error(
            "Get audit lead status error:",
            error.response?.data || error.message
        );

        return res.status(500).json({
            success: false,
            message: "Failed to check lead status",
        });
    }
};

module.exports = {
    saveAuditAsLead,
    getAuditLeadStatusController
}