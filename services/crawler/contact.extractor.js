// contact.extractor.js

const EMAIL_REGEX =
    /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+/g;

const PHONE_REGEX =
    /(?:\+?\d[\d\s().-]{7,}\d)/g;


/* =========================================================
   HELPERS
========================================================= */

const normalizeEmail = (email) => {
    if (!email) return null;

    return email
        .trim()
        .toLowerCase()
        .replace(/^mailto:/i, "")
        .replace(/[.,;:)\]}]+$/, "");
};


const isValidEmail = (email) => {
    if (!email) return false;

    if (email.length > 254) return false;

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};


const classifyEmail = (email) => {

    const localPart =
        email
            .split("@")[0]
            .toLowerCase();

    if (
        /^(support|help|customer|customerservice|service)$/.test(
            localPart
        )
    ) {
        return "support";
    }

    if (
        /^(sales|selling|orders|order)$/.test(
            localPart
        )
    ) {
        return "sales";
    }

    if (
        /^(info|information|contact|hello|hi|hey)$/.test(
            localPart
        )
    ) {
        return "general";
    }

    if (
        /^(admin|office|business)$/.test(
            localPart
        )
    ) {
        return "business";
    }

    if (
        /^(privacy|legal|compliance)$/.test(
            localPart
        )
    ) {
        return "legal";
    }

    return "other";
};


/* =========================================================
   EMAIL EXTRACTION
========================================================= */

const extractEmails = (
    html = "",
    pageUrl = null
) => {

    const found = new Map();


    /*
     * 1. Extract visible/plain-text emails
     */

    const matches =
        html.match(EMAIL_REGEX) || [];


    for (const rawEmail of matches) {

        const email =
            normalizeEmail(rawEmail);


        if (
            !email ||
            !isValidEmail(email)
        ) {
            continue;
        }


        if (!found.has(email)) {

            found.set(email, {
                email,
                type: classifyEmail(email),
                foundOn: []
            });
        }


        if (
            pageUrl &&
            !found.get(email).foundOn.includes(
                pageUrl
            )
        ) {

            found.get(email).foundOn.push(
                pageUrl
            );
        }
    }


    /*
     * 2. Extract mailto links.
     *
     * This catches emails that may not
     * appear as normal visible text.
     */

    const mailtoRegex =
        /mailto:([^"'?#\s>]+)/gi;


    let mailtoMatch;


    while (
        (mailtoMatch =
            mailtoRegex.exec(html)) !== null
    ) {

        const email =
            normalizeEmail(
                mailtoMatch[1]
            );


        if (
            !email ||
            !isValidEmail(email)
        ) {
            continue;
        }


        if (!found.has(email)) {

            found.set(email, {
                email,
                type: classifyEmail(email),
                foundOn: []
            });
        }


        if (
            pageUrl &&
            !found.get(email).foundOn.includes(
                pageUrl
            )
        ) {

            found.get(email).foundOn.push(
                pageUrl
            );
        }
    }


    return Array.from(
        found.values()
    );
};


/* =========================================================
   PHONE EXTRACTION
========================================================= */

const extractPhones = (
    html = "",
    pageUrl = null
) => {

    const found = new Set();

    const matches =
        html.match(PHONE_REGEX) || [];


    for (const phone of matches) {

        const cleaned =
            phone
                .replace(/\s+/g, " ")
                .trim();


        /*
         * Avoid treating random numbers as phones.
         */

        const digits =
            cleaned.replace(/\D/g, "");


        if (
            digits.length < 8 ||
            digits.length > 15
        ) {
            continue;
        }


        found.add(cleaned);
    }


    return Array.from(found).map(
        (phone) => ({
            phone,
            foundOn: pageUrl
                ? [pageUrl]
                : []
        })
    );
};


/* =========================================================
   MAIN
========================================================= */

const extractContactData = (
    html,
    pageUrl
) => {

    return {

        emails:
            extractEmails(
                html,
                pageUrl
            ),

        phones:
            extractPhones(
                html,
                pageUrl
            )
    };
};


module.exports = {
    extractContactData,
    extractEmails,
    extractPhones,
    classifyEmail
};