/**
 * Workers AI runner with optional AI Gateway routing.
 *
 * Routing:
 *   - If `options.gatewaySlug` or env `AI_GATEWAY_SLUG` is set AND `env.AI.gateway`
 *     is a function, calls `env.AI.gateway(slug).run(model, input)`.
 *   - Otherwise calls `env.AI.run(model, input)` directly.
 * The per-call override wins. Falls through to direct AI binding if the gateway
 * proxy lacks `.run` (defensive — guards against runtime API drift).
 *
 * Returns the raw model response. Use `extractResponseText` to normalize the
 * many possible output shapes (LLaVA, GLM-OCR, OpenAI-compat, plain strings).
 */

interface RunVisionEnv {
    AI: Ai;
    AI_GATEWAY_SLUG?: string;
    AI_GATEWAY_TOKEN?: string;
}

export interface RunVisionOptions {
    gatewaySlug?: string;
}

/** Loose model id. Workers AI typings only enumerate a subset of the catalog. */
export type VisionModel = string;

export type VisionInput =
    | { image: number[]; prompt: string }
    | { messages: Array<{ role: string; content: unknown }> }
    | Record<string, unknown>;

export async function runVisionWithGateway(
    env: RunVisionEnv,
    model: VisionModel,
    input: VisionInput,
    options: RunVisionOptions = {}
): Promise<unknown> {
    const slug = options.gatewaySlug ?? env.AI_GATEWAY_SLUG;

    if (slug && typeof env.AI?.gateway === "function") {
        // Use the binding-provided `env.AI.gateway(slug)` proxy so Cloudflare
        // handles auth — never build the REST URL by hand (leaks tokens, breaks on API drift).
        const gw = env.AI.gateway(slug) as unknown as {
            run: (m: string, i: unknown) => Promise<unknown>;
        };
        if (typeof gw.run === "function") {
            return gw.run(model, input);
        }
    }

    // Cast through unknown: `Ai.run` is heavily overloaded for known model ids
    // but VisionModel is intentionally a string to accept catalog entries
    // missing from the typings.
    const ai = env.AI as unknown as { run: (m: string, i: unknown) => Promise<unknown> };
    return ai.run(model, input);
}

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
            if (message && typeof message["content"] === "string") {
                return message["content"];
            }
            if (typeof first["text"] === "string") {
                return first["text"];
            }
        }
    }

    return "";
}
