/**
 * Social-platform registry — the single source of truth for platform identity,
 * per-platform handle cleaning/validation, and canonical profile URLs.
 *
 * The Instagram entry DELEGATES to the benchmark-frozen `cleanUsername` /
 * `isValidInstagramFormat` (by reference, not copy), so an Instagram handle runs
 * the EXACT same code path it ran when the tool was Instagram-only. This is what
 * keeps the docs/benchmark.md accuracy contract valid after generalization.
 *
 * This module is client-safe (pure — no fetch/KV/server-only imports), so the
 * wire types in `$lib/types/messages` and the parser in `$lib/extract/parse-response`
 * can import the `Platform` type from here.
 */

import { cleanUsername } from "$lib/extract/clean";
import { isValidInstagramFormat } from "$lib/extract/validate";

export type Platform = "instagram" | "facebook" | "tiktok" | "youtube" | "other";

/** Extraction granularity returned by the VLM: an @handle, or a fallback display/channel name. */
export type ExtractionKind = "handle" | "display_name";

export const PLATFORM_LABELS: Record<Platform, string> = {
    instagram: "Instagram",
    facebook: "Facebook",
    tiktok: "TikTok",
    youtube: "YouTube",
    other: "Other"
};

export interface PlatformConfig {
    id: Platform;
    label: string;
    maxHandleLength: number;
    /** Platform-normalized handle, or `null` if the input cannot be a valid handle. */
    cleanHandle: (text: string) => string | null;
    /** Format check that earns the confidence +10 bonus. */
    isValidFormat: (handle: string) => boolean;
    /** Canonical public profile URL for a cleaned handle (`""` when none exists). */
    buildProfileUrl: (username: string) => string;
}

const ALNUM_RE = /[a-z0-9]/;
const WHITESPACE_RE = /\s+/g;
const LEADING_AT_RE = /^@+/;
const LEADING_DOTS_RE = /^[._-]+/;
const TRAILING_DOTS_RE = /[.-]+$/;
// Format (zero-width / BOM) + control code points — stripped from display names.
const INVISIBLE_RE = /[\p{Cf}\p{Cc}]/gu;

/**
 * Generic handle cleaner used by the non-Instagram platforms. Mirrors the shape
 * of the frozen `cleanUsername` (lowercase → strip whitespace/@ → strip invalid
 * chars → strip leading/trailing separators → length + first-char checks) but is
 * parameterized by charset and length so each platform owns its own rules.
 */
function makeHandleCleaner(opts: {
    stripInvalid: RegExp;
    minLength: number;
    maxLength: number;
}): (text: string) => string | null {
    return (text: string): string | null => {
        if (!text) {
            return null;
        }
        let cleaned = text.toLowerCase().trim();
        cleaned = cleaned.replace(WHITESPACE_RE, "");
        cleaned = cleaned.replace(LEADING_AT_RE, "");
        cleaned = cleaned.replace(opts.stripInvalid, "");
        cleaned = cleaned.replace(LEADING_DOTS_RE, "");
        cleaned = cleaned.replace(TRAILING_DOTS_RE, "");

        if (cleaned.length < opts.minLength || cleaned.length > opts.maxLength) {
            return null;
        }
        const first = cleaned[0];
        if (!first || !ALNUM_RE.test(first)) {
            return null;
        }
        if (!ALNUM_RE.test(cleaned)) {
            return null;
        }
        return cleaned;
    };
}

function makeFormatValidator(opts: { valid: RegExp; maxLength: number }): (handle: string) => boolean {
    return (handle: string): boolean => {
        if (!handle || handle.length > opts.maxLength) {
            return false;
        }
        if (!opts.valid.test(handle)) {
            return false;
        }
        const first = handle[0];
        if (!first || !ALNUM_RE.test(first)) {
            return false;
        }
        if (handle.endsWith(".") || handle.endsWith("-")) {
            return false;
        }
        return !/\.\./.test(handle);
    };
}

const tiktokCleaner = makeHandleCleaner({ stripInvalid: /[^a-z0-9._]/g, minLength: 1, maxLength: 24 });
const youtubeCleaner = makeHandleCleaner({ stripInvalid: /[^a-z0-9._-]/g, minLength: 3, maxLength: 30 });
const facebookCleaner = makeHandleCleaner({ stripInvalid: /[^a-z0-9.]/g, minLength: 5, maxLength: 50 });
const otherCleaner = makeHandleCleaner({ stripInvalid: /[^a-z0-9._-]/g, minLength: 1, maxLength: 50 });

const REGISTRY: Record<Platform, PlatformConfig> = {
    instagram: {
        id: "instagram",
        label: PLATFORM_LABELS.instagram,
        maxHandleLength: 30,
        // Reference (not copy) the frozen functions — guarantees zero IG drift.
        cleanHandle: cleanUsername,
        isValidFormat: isValidInstagramFormat,
        buildProfileUrl: (u) => `https://instagram.com/${u}`
    },
    tiktok: {
        id: "tiktok",
        label: PLATFORM_LABELS.tiktok,
        maxHandleLength: 24,
        cleanHandle: tiktokCleaner,
        isValidFormat: makeFormatValidator({ valid: /^[a-z0-9._]{1,24}$/, maxLength: 24 }),
        buildProfileUrl: (u) => `https://www.tiktok.com/@${u}`
    },
    youtube: {
        id: "youtube",
        label: PLATFORM_LABELS.youtube,
        maxHandleLength: 30,
        cleanHandle: youtubeCleaner,
        isValidFormat: makeFormatValidator({ valid: /^[a-z0-9._-]{3,30}$/, maxLength: 30 }),
        buildProfileUrl: (u) => `https://www.youtube.com/@${u}`
    },
    facebook: {
        id: "facebook",
        label: PLATFORM_LABELS.facebook,
        maxHandleLength: 50,
        cleanHandle: facebookCleaner,
        isValidFormat: makeFormatValidator({ valid: /^[a-z0-9.]{5,50}$/, maxLength: 50 }),
        buildProfileUrl: (u) => `https://www.facebook.com/${u}`
    },
    other: {
        id: "other",
        label: PLATFORM_LABELS.other,
        maxHandleLength: 50,
        cleanHandle: otherCleaner,
        // Reuse the IG validator so a JSON-fallback handle that happens to be
        // IG-shaped still earns the +10 bonus (preserves legacy bare-string scoring).
        isValidFormat: isValidInstagramFormat,
        buildProfileUrl: () => ""
    }
};

/** Resolve a platform config, falling back to `other` for any unknown id. */
export function getPlatform(id: Platform | string | null | undefined): PlatformConfig {
    if (id && id in REGISTRY) {
        return REGISTRY[id as Platform];
    }
    return REGISTRY.other;
}

/**
 * Gentle normalization for `kind:"display_name"` results (Facebook real names,
 * YouTube channel names, page names). Unlike handles, display names KEEP their
 * case and internal spaces — they are human-facing labels, not URL slugs.
 */
export function cleanDisplayName(text: string): string | null {
    if (!text) {
        return null;
    }
    // Newlines/tabs → single spaces first, then strip zero-width/control chars.
    let s = text.replace(WHITESPACE_RE, " ");
    s = s.replace(INVISIBLE_RE, "").trim();
    // Strip surrounding quotes the model sometimes wraps names in.
    s = s.replace(/^["'`]+|["'`]+$/g, "").trim();
    if (s.length > 64) {
        s = s.slice(0, 64).trim();
    }
    return s.length > 0 ? s : null;
}

/**
 * Canonical public profile URL for a cleaned value, or `null` when none exists
 * (display-name leads, the `other` platform, or an empty username).
 */
export function buildProfileUrl(
    platform: Platform,
    username: string | null | undefined,
    kind: ExtractionKind
): string | null {
    if (kind === "display_name" || !username) {
        return null;
    }
    const url = getPlatform(platform).buildProfileUrl(username);
    return url.length > 0 ? url : null;
}
