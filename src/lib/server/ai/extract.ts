/**
 * Single-image VLM extraction pipeline. The queue consumer calls this once per `job_items` row.
 *
 *   imageBytes → runVisionViaRest (user's Cloudflare account) → extractResponseText
 *               → cleanUsername → scoreConfidence → tierOf + classifyStatus
 *
 * Inference runs on the END USER's own Cloudflare account via the REST API
 * (billed to them) — `creds` + `model` are resolved per-user upstream. The owner's
 * bound `env.AI` is no longer used here.
 *
 * Returns `username = null` and `status = "review"` when cleanUsername yields
 * nothing — never throws on extraction failure (transport / auth errors DO throw
 * as `CfInferenceError`, mapped by the consumer).
 *
 * `rawText` is always populated for diagnostics; callers must only persist it
 * to `job_items.raw_model_response` when `jobs.diagnostics = 1`.
 */

import { cleanUsername } from "$lib/extract/clean";
import { containsHedging, scoreConfidence } from "$lib/extract/confidence";
import { classifyStatus, tierOf, type Tier } from "$lib/extract/classify";
import { EXTRACT_USERNAME_PROMPT } from "$lib/extract/prompt";
import { extractResponseText } from "./gateway";
import { runVisionViaRest, DEFAULT_VISION_MODEL, type CloudflareCreds } from "./run-rest";

export interface ExtractInput {
    /** The user's Cloudflare account creds — inference is billed to them. */
    creds: CloudflareCreds;
    /** Selected Workers AI vision model id. Defaults to the benchmark-validated model. */
    model?: string;
    imageBytes: ArrayBuffer | Uint8Array;
    prompt?: string;
}

export interface ExtractResult {
    username: string | null;
    rawText: string;
    confidence: number;
    tier: Tier;
    status: "verified" | "review";
}

function toByteArray(input: ArrayBuffer | Uint8Array): number[] {
    const view = input instanceof Uint8Array ? input : new Uint8Array(input);
    const out = new Array<number>(view.length);
    for (let i = 0; i < view.length; i++) {
        out[i] = view[i] as number;
    }
    return out;
}

export async function extractUsernameFromImage(input: ExtractInput): Promise<ExtractResult> {
    const prompt = input.prompt ?? EXTRACT_USERNAME_PROMPT;
    const model = input.model ?? DEFAULT_VISION_MODEL;
    const image = toByteArray(input.imageBytes);

    const raw = await runVisionViaRest(input.creds, model, { image, prompt });
    const rawText = extractResponseText(raw);

    const username = cleanUsername(rawText);
    if (!username) {
        return {
            username: null,
            rawText,
            confidence: 0,
            tier: null,
            status: "review"
        };
    }

    const hedged = containsHedging(rawText);
    const confidence = scoreConfidence({ username, rawText, hedged });
    const tier = tierOf(confidence);
    const status = classifyStatus(confidence);

    return { username, rawText, confidence, tier, status };
}
