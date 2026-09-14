const OPENROUTER_URL =
    "https://openrouter.ai/api/v1/chat/completions";

const { aiAuditSchema } = require("./audit.schema");


/**
 * Extract JSON from an AI response.
 *
 * Handles:
 * 1. Pure JSON
 * 2. ```json ... ```
 * 3. ``` ... ```
 * 4. JSON surrounded by extra text
 */
const extractJson = (content) => {
    if (!content || typeof content !== "string") {
        throw new Error(
            "AI returned an empty response."
        );
    }

    const cleaned = content.trim();

    // ---------------------------------------------------------
    // 1. Direct JSON
    // ---------------------------------------------------------

    try {
        return JSON.parse(cleaned);
    } catch {
        // Continue
    }

    // ---------------------------------------------------------
    // 2. Markdown JSON block
    // ---------------------------------------------------------

    const jsonBlock =
        cleaned.match(
            /```json\s*([\s\S]*?)\s*```/i
        ) ||
        cleaned.match(
            /```\s*([\s\S]*?)\s*```/i
        );

    if (jsonBlock) {
        try {
            return JSON.parse(
                jsonBlock[1].trim()
            );
        } catch {
            // Continue
        }
    }

    // ---------------------------------------------------------
    // 3. JSON surrounded by text
    // ---------------------------------------------------------

    const firstBrace =
        cleaned.indexOf("{");

    const lastBrace =
        cleaned.lastIndexOf("}");

    if (
        firstBrace !== -1 &&
        lastBrace !== -1 &&
        lastBrace > firstBrace
    ) {
        const possibleJson =
            cleaned.slice(
                firstBrace,
                lastBrace + 1
            );

        try {
            return JSON.parse(
                possibleJson
            );
        } catch {
            // Continue
        }
    }

    console.error(
        "AI RAW RESPONSE:\n",
        cleaned
    );

    throw new Error(
        "AI response was not valid JSON."
    );
};


/**
 * Analyze deterministic Shopify audit
 * using OpenRouter.
 */
const analyzeWithOpenRouter = async ({
    systemPrompt,
    userPrompt
}) => {

    const apiKey =
        process.env.OPENROUTER_API_KEY;

    const model =
        process.env.OPENROUTER_MODEL ||
        "nex-agi/nex-n2.5-pro:free";

    const maxTokens =
        Number(process.env.OPENROUTER_MAX_TOKENS) || 10000;


    // ---------------------------------------------------------
    // CONFIG VALIDATION
    // ---------------------------------------------------------

    if (!apiKey) {
        throw new Error(
            "OPENROUTER_API_KEY is not configured."
        );
    }


    console.log(
        `Sending audit to OpenRouter using model: ${model}`
    );


    // ---------------------------------------------------------
    // REQUEST
    // ---------------------------------------------------------

    const response = await fetch(
        OPENROUTER_URL,
        {
            method: "POST",

            headers: {
                "Content-Type":
                    "application/json",

                Authorization:
                    `Bearer ${apiKey}`,

                "HTTP-Referer":
                    "http://localhost:5000",

                "X-Title":
                    "TegaScout AI Shopify Auditor"
            },

            body: JSON.stringify({

                model,

                messages: [
                    {
                        role: "system",
                        content: systemPrompt
                    },

                    {
                        role: "user",
                        content: userPrompt
                    }
                ],

                /*
                 * Low temperature because this is
                 * structured audit analysis.
                 */
                temperature: 0.1,

                /*
                 * Enough room for our compact report.
                 */
                max_tokens: maxTokens,

                /*
                 * Ask OpenRouter for JSON.
                 *
                 * openrouter/free automatically selects
                 * a free model that supports the required
                 * capabilities when possible.
                 */
                response_format: {
                    type: "json_object"
                }
            })
        }
    );


    // ---------------------------------------------------------
    // READ RESPONSE
    // ---------------------------------------------------------

    const responseText =
        await response.text();


    // ---------------------------------------------------------
    // HTTP ERROR
    // ---------------------------------------------------------

    if (!response.ok) {

        console.error(
            "OpenRouter error:",
            responseText
        );

        throw new Error(
            `OpenRouter request failed (${response.status}): ${responseText}`
        );
    }


    // ---------------------------------------------------------
    // PARSE OPENROUTER RESPONSE
    // ---------------------------------------------------------

    let data;

    try {

        data =
            JSON.parse(
                responseText
            );

            console.log(
    "OpenRouter model used:",
    data.model
);

    } catch {

        console.error(
            "Invalid OpenRouter response:",
            responseText
        );

        throw new Error(
            "OpenRouter returned invalid JSON."
        );
    }


    // ---------------------------------------------------------
    // GET CHOICE
    // ---------------------------------------------------------

    const choice =
        data?.choices?.[0];


    if (!choice) {

        console.error(
            "Unexpected OpenRouter response:",
            JSON.stringify(
                data,
                null,
                2
            )
        );

        throw new Error(
            "OpenRouter response did not contain a valid choice."
        );
    }


    // ---------------------------------------------------------
    // FINISH REASON
    // ---------------------------------------------------------

    const finishReason =
        choice.finish_reason;

        console.log(
    "OpenRouter usage:",
    JSON.stringify(data.usage, null, 2)
);

console.log(
    "Max tokens configured: ", maxTokens);


    console.log(
        "OpenRouter finish reason:",
        finishReason
    );


    /*
     * If the model reaches max_tokens,
     * the JSON may be incomplete.
     */
    if (
        finishReason === "length"
    ) {

        console.error(
            "AI response was truncated."
        );

        throw new Error(
            "AI response was truncated because max_tokens was reached."
        );
    }


    // ---------------------------------------------------------
    // GET AI CONTENT
    // ---------------------------------------------------------

    const content =
        choice?.message?.content;


    if (!content) {

        console.error(
            "OpenRouter choice:",
            JSON.stringify(
                choice,
                null,
                2
            )
        );

        throw new Error(
            "OpenRouter response did not contain AI content."
        );
    }


    // ---------------------------------------------------------
    // EXTRACT JSON
    // ---------------------------------------------------------

    let parsed;

    try {

        parsed =
            extractJson(
                content
            );

    } catch (error) {

        console.error(
            "AI JSON extraction failed:",
            error.message
        );

        console.error(
            "AI content:",
            content
        );

        throw error;
    }


    // ---------------------------------------------------------
    // ZOD VALIDATION
    // ---------------------------------------------------------

    const validated =
        aiAuditSchema.safeParse(
            parsed
        );


    if (!validated.success) {

        console.error(
            "AI validation errors:",
            validated.error.issues
        );

        console.error(
            "AI parsed output:",
            JSON.stringify(
                parsed,
                null,
                2
            )
        );

        throw new Error(
            "AI response failed schema validation."
        );
    }


    console.log(
        "AI audit successfully validated."
    );


    return validated.data;
};


module.exports = {
    analyzeWithOpenRouter
};