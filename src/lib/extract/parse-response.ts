/**
 * Parses the VLM's response for the multi-platform `DETECT_PROFILE_PROMPT` into
 * a `{ platform, username, kind }` triple.
 *
 * The model is asked for strict one-line JSON, but real VLMs routinely wrap it in
 * ```json fences, single quotes, prose, <think> reasoning, an echoed example object
 * BEFORE the real answer, or a nested envelope like `{"description":"…json…"}`
 * (llava) — so this parser is deliberately defensive and NEVER throws.
 *
 * Strategy (M-020 fix): scan ALL balanced JSON objects in the text (string-aware,
 * so braces inside string values don't fool the scanner) and keep the LAST one
 * that yields a usable profile. Chatty models put their reasoning + an echoed
 * placeholder example FIRST and the real answer LAST, so "last valid object" wins
 * where the old "first `{` … last `}`" slice produced invalid JSON and dropped the
 * answer entirely.
 *
 * Critical backward-compat hinge: when NO object yields a usable username (e.g. the
 * model emitted a bare `lebron.james`), fall back to treating the whole de-fenced
 * text as a `handle` on platform `other` — preserving the legacy Instagram-only
 * behavior and the `other` registry's lenient cleaning.
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
const THINK_TAG_RE = /<\/?think>/gi;

/** Fields a VLM may nest the real JSON/answer string inside (llava: `{"description":"…"}`). */
const WRAPPER_FIELDS = ["description", "content", "text", "output", "response", "answer", "result", "caption"];

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

function coerceFromObject(obj: Record<string, unknown>, depth: number): ParsedProfile | null {
    const rawUsername = obj["username"] ?? obj["handle"] ?? obj["name"] ?? obj["value"];
    let username = typeof rawUsername === "string" ? rawUsername.trim() : "";

    if (username) {
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

    // No direct username field — try unwrapping a nested envelope (e.g. llava's `{"description":"…json…"}`).
    if (depth < 3) {
        for (const f of WRAPPER_FIELDS) {
            const v = obj[f];
            if (typeof v === "string" && v.includes("{")) {
                const nested = parseFromText(v, depth + 1);
                if (nested) {
                    return nested;
                }
            }
        }
    }
    return null;
}

/**
 * String-aware extraction of every top-level balanced `{…}` object. Braces inside
 * JSON string values (`"a{b}c"`) are ignored, so a `{"description":"{…}"}` envelope
 * is returned whole rather than split.
 */
function extractJsonObjects(text: string): string[] {
    const out: string[] = [];
    let depth = 0;
    let start = -1;
    let inStr = false;
    let esc = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inStr) {
            if (esc) esc = false;
            else if (c === "\\") esc = true;
            else if (c === '"') inStr = false;
            continue;
        }
        if (c === '"') {
            inStr = true;
        } else if (c === "{") {
            if (depth === 0) start = i;
            depth++;
        } else if (c === "}") {
            if (depth > 0) {
                depth--;
                if (depth === 0 && start !== -1) {
                    out.push(text.slice(start, i + 1));
                    start = -1;
                }
            }
        }
    }
    return out;
}

function tryParseObject(src: string): Record<string, unknown> | null {
    // Parse as-is, then retry with single→double quotes.
    for (const s of [src, src.replace(/'/g, '"')]) {
        try {
            const parsed = JSON.parse(s) as unknown;
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                return parsed as Record<string, unknown>;
            }
        } catch {
            // try the next variant
        }
    }
    return null;
}

/** Parse every balanced object in `text`; return the LAST one that yields a usable profile. */
function parseFromText(text: string, depth: number): ParsedProfile | null {
    let last: ParsedProfile | null = null;
    for (const candidate of extractJsonObjects(text)) {
        const obj = tryParseObject(candidate);
        if (!obj) continue;
        const profile = coerceFromObject(obj, depth);
        if (profile) {
            last = profile; // keep the last valid — the real answer follows the reasoning/example
        }
    }
    return last;
}

/** Robustly extract `{ platform, username, kind }`. Never throws. */
export function parseProfileResponse(text: string): ParsedProfile {
    const trimmed = (text ?? "").trim();
    if (!trimmed) {
        return { platform: "other", username: "", kind: "handle" };
    }

    const defenced = trimmed.replace(FENCE_OPEN_RE, "").replace(FENCE_CLOSE_RE, "").trim();

    const fromObjects = parseFromText(defenced, 0);
    if (fromObjects) {
        return fromObjects;
    }

    // Fallback: treat the whole (de-fenced, think-stripped) text as a bare handle.
    const bare = defenced.replace(THINK_TAG_RE, "").replace(LEADING_AT_RE, "").trim();
    return { platform: "other", username: bare, kind: "handle" };
}
