/**
 * Single-image VLM extraction pipeline. The queue consumer calls this once per `job_items` row.
 *
 *   imageBytes → runVisionViaRest (user's Cloudflare account) → extractResponseText
 *               → parseProfileResponse → per-platform cleaner → scoreProfileConfidence
 *               → tierOf + classifyStatus + buildProfileUrl
 *
 * Inference runs on the END USER's own Cloudflare account via the REST API
 * (billed to them) — `creds` + `model` are resolved per-user upstream.
 *
 * The model auto-detects the platform and returns `{platform, username, kind}`.
 * `kind:"handle"` runs the per-platform handle cleaner; `kind:"display_name"`
 * (no @handle visible) runs the gentler display-name normalizer. For an Instagram
 * handle the path is byte-identical to the legacy Instagram-only pipeline.
 *
 * Returns `username = null` and `status = "review"` when the value cleans to
 * nothing — never throws on extraction failure (transport / auth errors DO throw
 * as `CfInferenceError`, mapped by the consumer).
 *
 * `rawText` is always populated for diagnostics; callers must only persist it
 * to `job_items.raw_model_response` when `jobs.diagnostics = 1`.
 */

import { containsHedging, scoreConfidence } from "$lib/extract/confidence";
import { classifyStatus, tierOf, type Tier } from "$lib/extract/classify";
import { hasUnusualPattern } from "$lib/extract/validate";
import { DETECT_PROFILE_PROMPT } from "$lib/extract/prompt";
import { parseProfileResponse } from "$lib/extract/parse-response";
import {
    buildProfileUrl,
    cleanDisplayName,
    getPlatform,
    type ExtractionKind,
    type Platform,
    type PlatformConfig
} from "$lib/social/platform";
import { extractResponseText } from "./gateway";
import { runVisionViaRest, DEFAULT_VISION_MODEL, type CloudflareCreds } from "./run-rest";

/** Output cap for the JSON-returning detection prompt — generous so it can't truncate. */
const MAX_OUTPUT_TOKENS = 256;

const BASE_CONFIDENCE = 85;
const MIN_CONFIDENCE = 60;
const MAX_CONFIDENCE = 100;
const HEDGING_PENALTY = 15;
const FORMAT_BONUS = 10;
const UNUSUAL_PENALTY = 10;

export interface ExtractInput {
    /** The user's Cloudflare account creds — inference is billed to them. */
    creds: CloudflareCreds;
    /** Selected Workers AI vision model id. Defaults to the benchmark-validated model. */
    model?: string;
    imageBytes: ArrayBuffer | Uint8Array;
}

export interface ExtractResult {
    username: string | null;
    platform: Platform;
    kind: ExtractionKind;
    /** Canonical profile URL, or null for display-name leads / the `other` platform. */
    profileUrl: string | null;
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

/**
 * Per-platform confidence. Instagram handles take the EXACT legacy scoring path
 * (`scoreConfidence`); other handles use the same math with the platform's own
 * format validator; display names skip the handle-format bonus and the
 * OCR-corruption penalty entirely.
 */
function scoreProfileConfidence(opts: {
    cleaned: string;
    rawText: string;
    hedged: boolean;
    platform: PlatformConfig;
    kind: ExtractionKind;
}): number {
    const { cleaned, rawText, hedged, platform, kind } = opts;

    if (kind === "handle" && platform.id === "instagram") {
        return scoreConfidence({ username: cleaned, rawText, hedged });
    }

    let score = BASE_CONFIDENCE;
    if (hedged) {
        score -= HEDGING_PENALTY;
    }
    if (kind === "handle") {
        if (platform.isValidFormat(cleaned)) {
            score += FORMAT_BONUS;
        }
        if (hasUnusualPattern(cleaned)) {
            score -= UNUSUAL_PENALTY;
        }
    }
    return Math.max(MIN_CONFIDENCE, Math.min(score, MAX_CONFIDENCE));
}

export async function extractUsernameFromImage(input: ExtractInput): Promise<ExtractResult> {
    const model = input.model ?? DEFAULT_VISION_MODEL;
    const image = toByteArray(input.imageBytes);

    const raw = await runVisionViaRest(input.creds, model, {
        image,
        prompt: DETECT_PROFILE_PROMPT,
        maxTokens: MAX_OUTPUT_TOKENS
    });
    const rawText = extractResponseText(raw);

    const parsed = parseProfileResponse(rawText);
    const platform = getPlatform(parsed.platform);
    const kind = parsed.kind;

    const cleaned = kind === "display_name" ? cleanDisplayName(parsed.username) : platform.cleanHandle(parsed.username);

    if (!cleaned) {
        return {
            username: null,
            platform: platform.id,
            kind,
            profileUrl: null,
            rawText,
            confidence: 0,
            tier: null,
            status: "review"
        };
    }

    const hedged = containsHedging(rawText);
    const confidence = scoreProfileConfidence({ cleaned, rawText, hedged, platform, kind });
    const tier = tierOf(confidence);
    const status = classifyStatus(confidence);
    const profileUrl = buildProfileUrl(platform.id, cleaned, kind);

    return { username: cleaned, platform: platform.id, kind, profileUrl, rawText, confidence, tier, status };
}
