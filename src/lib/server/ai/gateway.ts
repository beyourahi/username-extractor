/**
 * Normalizes the heterogeneous Workers AI vision output to a plain string.
 * Returns `""` when no recognized shape is found (caller treats as no extraction).
 *
 * Probes in order (first match wins):
 *   1. plain string
 *   2. `{ response }`    — classic LLaVA / GLM-OCR
 *   3. `{ description }` — image captioners
 *   4. `{ text }`        — newer endpoints
 *   5. `{ choices[0].message.content }` — OpenAI-compat chat
 *   6. `{ choices[0].text }` — OpenAI-compat completion
 */
export function extractResponseText(raw: unknown): string {
    if (raw == null) {
        return "";
    }
    if (typeof raw === "string") {
        return raw;
    }
    if (typeof raw !== "object") {
        return "";
    }

    const obj = raw as Record<string, unknown>;

    if (typeof obj["response"] === "string") {
        return obj["response"];
    }
    if (typeof obj["description"] === "string") {
        return obj["description"];
    }
    if (typeof obj["text"] === "string") {
        return obj["text"];
    }

    const choices = obj["choices"];
    if (Array.isArray(choices) && choices.length > 0) {
        const first = choices[0] as Record<string, unknown> | undefined;
        if (first) {
            const message = first["message"] as Record<string, unknown> | undefined;
            if (message) {
                const content = message["content"];
                if (typeof content === "string") {
                    return content;
                }
                // Some chat-vision models return content as an array of blocks ([{type:"text",text}]).
                if (Array.isArray(content)) {
                    return content
                        .map((p) => (typeof p === "string" ? p : ((p as { text?: unknown })?.text ?? "")))
                        .join("");
                }
            }
            if (typeof first["text"] === "string") {
                return first["text"];
            }
        }
    }

    return "";
}
