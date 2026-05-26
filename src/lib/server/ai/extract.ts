/**
 * Single-image VLM extraction pipeline. The queue consumer calls this once per `job_items` row.
 *
 *   imageBytes → runVisionWithGateway → extractResponseText → cleanUsername
 *               → scoreConfidence → tierOf + classifyStatus
 *
 * Returns `username = null` and `status = "review"` when cleanUsername yields
 * nothing — never throws on extraction failure (transport errors do throw).
 *
 * `rawText` is always populated for diagnostics; callers must only persist it
 * to `job_items.raw_model_response` when `jobs.diagnostics = 1`.
 */

import { cleanUsername } from "$lib/extract/clean";
import { containsHedging, scoreConfidence } from "$lib/extract/confidence";
import { classifyStatus, tierOf, type Tier } from "$lib/extract/classify";
import { EXTRACT_USERNAME_PROMPT } from "$lib/extract/prompt";
import { extractResponseText, runVisionWithGateway, type VisionModel } from "./gateway";

export interface ExtractInput {
    env: { AI: Ai; AI_GATEWAY_SLUG?: string; AI_GATEWAY_TOKEN?: string };
    imageBytes: ArrayBuffer | Uint8Array;
    prompt?: string;
    model?: VisionModel;
}

export interface ExtractResult {
    username: string | null;
    rawText: string;
    confidence: number;
    tier: Tier;
    status: "verified" | "review";
}

/** Pinned vision model. The benchmark in docs/benchmark.md is recorded against THIS exact id;
 *  changing it invalidates the recorded accuracy. PRD spelling `@cf/moonshot/...` is a typo. */
const DEFAULT_MODEL: VisionModel = "@cf/moonshotai/kimi-k2.6";

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
    const model = input.model ?? DEFAULT_MODEL;
    const image = toByteArray(input.imageBytes);

    const raw = await runVisionWithGateway(input.env, model, { image, prompt });
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
