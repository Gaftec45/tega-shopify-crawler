
const ShopifyLead = require("../../models/ShopifyLead");
const { mapActor3Lead } = require("./lead.mapper");

const normalizeDomain = (domain) => {
    if (!domain) return null;

    return String(domain)
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .replace(/\/.*$/, "");
};

const saveActor3Leads = async ({
    items,
    userId,
    query,
    actorRunId,
    discoveryId
}) => {
    if (!Array.isArray(items)) {
        throw new Error("Actor results must be an array");
    }

    const mappedLeads = items
        .map(item =>
            mapActor3Lead(item, {
                userId,
                query,
                actorRunId
            })
        )
        .filter(Boolean)
        .map(lead => ({
            ...lead,
            domain: normalizeDomain(lead.domain)
        }))
        .filter(lead => lead.domain);

    // Deduplicate the dataset by normalized domain.
    const uniqueLeads = new Map();

    for (const lead of mappedLeads) {
        uniqueLeads.set(lead.domain, lead);
    }

    const leads = [...uniqueLeads.values()];

    let bulkWriteError = null;
    let bulkWriteResult = null;

    if (leads.length) {
        const operations = leads.map(lead => {
            const {
                firstDiscoveredAt,
                discoveryRunId: ignoredDiscoveryRunId,
                ...updateFields
            } = lead;

            const setOnInsert = {
                firstDiscoveredAt: new Date()
            };

            if (discoveryId) {
                setOnInsert.discoveryRunId = discoveryId;
            }

            return {
                updateOne: {
                    filter: {
                        user: userId,
                        domain: lead.domain
                    },
                    update: {
                        $set: updateFields,
                        $setOnInsert: setOnInsert
                    },
                    upsert: true
                }
            };
        });

        try {
            bulkWriteResult = await ShopifyLead.bulkWrite(
                operations,
                { ordered: false }
            );
        } catch (error) {
            // Unordered writes may partially succeed.
            bulkWriteError = error;
            bulkWriteResult = error.result || null;
        }
    }

    // Recover records inserted for this discovery.
    // This is also the source of truth for billing.
    let insertedLeads = [];

    if (discoveryId) {
        insertedLeads = await ShopifyLead.find({
            user: userId,
            discoveryRunId: discoveryId
        })
            .select("domain emails phones socialLinks")
            .lean();
    }

    // Propagate the error if nothing was successfully inserted.
    if (bulkWriteError && insertedLeads.length === 0) {
        throw bulkWriteError;
    }

    return {
        processed: items.length,
        saved: leads.length,
        inserted: insertedLeads.length,
        updated: Math.max(
            0,
            leads.length - insertedLeads.length
        ),
        duplicates: Math.max(
            0,
            mappedLeads.length - leads.length
        ),
        skipped: items.length - mappedLeads.length,
        partialFailure: Boolean(bulkWriteError),
        writeError: bulkWriteError?.message || null,
        insertedLeads
    };
};

module.exports = {
    saveActor3Leads
};
