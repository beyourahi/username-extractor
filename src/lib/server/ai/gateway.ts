/**
 * Workers AI invocation with optional AI Gateway routing.
 *
 * When `AI_GATEWAY_SLUG` (or per-call `gatewaySlug`) is set, we use the
 * official `env.AI.gateway(slug).run(...)`-style routing. Otherwise the call
 * goes directly to the Workers AI binding. The wrapper returns the raw model
 * response — callers normalize the shape.
 */

interface RunVisionEnv {
    AI: Ai;
    AI_GATEWAY_SLUG?: string;
    AI_GATEWAY_TOKEN?: string;
}

export interface RunVisionOptions {
    gatewaySlug?: string;
}

/** Loose model name — Workers AI typings only cover a subset. */
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
        // The Workers AI binding exposes a `gateway(id)` proxy that routes
        // model calls through the named AI Gateway instance. We use the
        // documented binding API rather than building the REST URL ourselves
        // so token handling stays in the platform.
        const gw = env.AI.gateway(slug) as unknown as {
            run: (m: string, i: unknown) => Promise<unknown>;
        };
        if (typeof gw.run === "function") {
            return gw.run(model, input);
        }
    }

    // Cast through unknown because the Ai.run signature is overloaded for the
    // strongly-typed model list; we deliberately allow loose model names.
    const ai = env.AI as unknown as { run: (m: string, i: unknown) => Promise<unknown> };
    return ai.run(model, input);
}

/**
 * Extract a usable text response from the heterogeneous Workers AI vision
 * output. Handles:
 * - `{ response: "text" }` (classic LLaVA / GLM-OCR shape)
 * - `{ description: "text" }` (some image captioners)
 * - `{ choices: [{ message: { content } }] }` (OpenAI-compat chat)
 * - plain string responses
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
