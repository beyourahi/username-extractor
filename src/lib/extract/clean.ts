/**
 * Username cleaning utility.
 *
 * Source: /Users/beyourahi/Desktop/projects/extract_usernames/extract_usernames/_archive/extract_usernames.py:723-745
 *
 * Normalizes raw OCR/VLM text into a candidate Instagram username, or returns
 * null if the text cannot represent a valid handle.
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
    // Keep \w (word chars: [A-Za-z0-9_]), '.', and '_' — strip everything else.
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
