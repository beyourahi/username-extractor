/**
 * Parses the VLM's response for the multi-platform `DETECT_PROFILE_PROMPT` into
 * a `{ platform, username, kind }` triple.
 *
 * The model is asked for strict one-line JSON, but small vision models routinely
 * wrap it in ```json fences, add prose, or use single quotes — so this parser is
 * deliberately defensive and NEVER throws.
 *
 * Critical backward-compat hinge: when the output is NOT parseable JSON at all
 * (e.g. the model ignored the instruction and emitted a bare `lebron.james`), we
 * fall back to treating the whole text as a `handle` on platform `other`. The
 * `other` registry entry cleans leniently and reuses the Instagram format
 * validator, so a bare IG-shaped handle still scores exactly as it did when the
 * tool was Instagram-only.
 */

import type { Platform, ExtractionKind } from "$lib/social/platform";

export interface ParsedProfile {
    platform: Platform;
    /** Raw, un-cleaned identifier — the caller applies the per-platform cleaner. */
    username: string;
    kind: ExtractionKind;
}

const FENCE_OPEN_RE = /^```(?:json)?\s*/i;
const FENCE_CLOSE_RE = /\s*```$/;
const LEADING_AT_RE = /^@+/;

const PLATFORM_SYNONYMS: Record<string, Platform> = {
    instagram: "instagram",
    insta: "instagram",
    ig: "instagram",
    facebook: "facebook",
    fb: "facebook",
    meta: "facebook",
    tiktok: "tiktok",
    "tik tok": "tiktok",
    tik: "tiktok",
    youtube: "youtube",
    yt: "youtube",
    "you tube": "youtube"
};

function normalizePlatform(value: unknown): Platform {
    if (typeof value !== "string") {
        return "other";
    }
    const key = value.toLowerCase().trim();
    if (key in PLATFORM_SYNONYMS) {
        return PLATFORM_SYNONYMS[key]!;
    }
    // Tolerate values like "instagram.com" or "youtube channel".
    for (const syn of Object.keys(PLATFORM_SYNONYMS)) {
        if (key.includes(syn)) {
            return PLATFORM_SYNONYMS[syn]!;
        }
    }
    return "other";
}

function coerceFromObject(obj: Record<string, unknown>): ParsedProfile | null {
    const rawUsername = obj["username"] ?? obj["handle"] ?? obj["name"] ?? obj["value"];
    let username = typeof rawUsername === "string" ? rawUsername.trim() : "";
    if (!username) {
        return null;
    }

    const platform = normalizePlatform(obj["platform"]);

    const hadAt = LEADING_AT_RE.test(username);
    username = username.replace(LEADING_AT_RE, "").trim();
    if (!username) {
        return null;
    }

    // An @-prefixed value is always a handle; otherwise honor the model's tag.
    let kind: ExtractionKind = obj["kind"] === "display_name" ? "display_name" : "handle";
    if (hadAt) {
        kind = "handle";
    }

    return { platform, username, kind };
}

/** Robustly extract `{ platform, username, kind }`. Never throws. */
export function parseProfileResponse(text: string): ParsedProfile {
    const trimmed = (text ?? "").trim();
    if (!trimmed) {
        return { platform: "other", username: "", kind: "handle" };
    }

    // 1. Strip code fences.
    const candidate = trimmed.replace(FENCE_OPEN_RE, "").replace(FENCE_CLOSE_RE, "").trim();

    // 2. Slice the first `{` … last `}` (drops leading/trailing prose).
    const open = candidate.indexOf("{");
    const close = candidate.lastIndexOf("}");
    if (open !== -1 && close > open) {
        const slice = candidate.slice(open, close + 1);

        // 3. Parse as-is, then retry with single→double quotes.
        for (const source of [slice, slice.replace(/'/g, '"')]) {
            try {
                const parsed = JSON.parse(source) as unknown;
                if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                    const result = coerceFromObject(parsed as Record<string, unknown>);
                    if (result) {
                        return result;
                    }
                }
            } catch {
                // try the next variant
            }
        }
    }

    // 4. Fallback: treat the whole (de-fenced) text as a bare handle. Preserves
    //    the legacy Instagram-only behavior for non-JSON model output.
    const bare = candidate.replace(LEADING_AT_RE, "").trim();
    return { platform: "other", username: bare, kind: "handle" };
}
