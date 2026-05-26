/**
 * Verbatim port of the Python CLI's `_clean_username` (extract_usernames.py:723-745).
 *
 * Returns a candidate Instagram handle or `null` if input cannot be a valid handle.
 * DO NOT change rules casually — behavior changes invalidate the recorded
 * Kimi K2.6 accuracy benchmark (docs/benchmark.md).
 *
 * Rules (applied in order):
 *   1. lowercase, trim, collapse all whitespace.
 *   2. Strip anything outside `[A-Za-z0-9_.]`.
 *   3. Strip leading `.` / `_`.
 *   4. Strip trailing `.`.
 *   5. Reject if length ∉ [1, 30], first char isn't alphanumeric, or no
 *      alphanumeric exists anywhere.
 */

const ALNUM_RE = /[a-z0-9]/;
const STRIP_INVALID_RE = /[^\w._]/g;
const WHITESPACE_RE = /\s+/g;
const LEADING_DOT_UNDERSCORE_RE = /^[._]+/;
const TRAILING_DOT_RE = /\.+$/;

export function cleanUsername(text: string): string | null {
    if (!text) {
        return null;
    }

    let cleaned = text.toLowerCase().trim();
    cleaned = cleaned.replace(WHITESPACE_RE, "");
    // STRIP_INVALID_RE = /[^\w._]/g keeps [A-Za-z0-9_] plus `.` and `_`.
    cleaned = cleaned.replace(STRIP_INVALID_RE, "");
    cleaned = cleaned.replace(LEADING_DOT_UNDERSCORE_RE, "");
    cleaned = cleaned.replace(TRAILING_DOT_RE, "");

    if (cleaned.length < 1 || cleaned.length > 30) {
        return null;
    }

    const first = cleaned[0];
    if (!first || !ALNUM_RE.test(first)) {
        return null;
    }

    if (cleaned.endsWith(".")) {
        return null;
    }

    if (!/[a-z0-9]/.test(cleaned)) {
        return null;
    }

    return cleaned;
}
