/**
 * Instagram username format validation and unusual-pattern detection.
 *
 * Source: /Users/beyourahi/Desktop/projects/extract_usernames/extract_usernames/_archive/extract_usernames.py:470-522
 */

const VALID_CHARS_RE = /^[a-z0-9._]+$/;
const ALNUM_RE = /[a-z0-9]/;
const CONSECUTIVE_DOTS_RE = /\.\./;
const REPEATED_SPECIAL_RE = /[._]{4,}/;
const VOWELS = new Set(["a", "e", "i", "o", "u"]);

/**
 * Validate username against Instagram format rules.
 *
 * - Length 1–30
 * - Only [a-z0-9._]
 * - Starts with alphanumeric
 * - Does not end with '.'
 * - No consecutive '..'
 */
export function isValidInstagramFormat(username: string): boolean {
    if (!username || username.length < 1 || username.length > 30) {
        return false;
    }
    if (!VALID_CHARS_RE.test(username)) {
        return false;
    }
    const first = username[0];
    if (!first || !ALNUM_RE.test(first)) {
        return false;
    }
    if (username.endsWith(".")) {
        return false;
    }
    if (CONSECUTIVE_DOTS_RE.test(username)) {
        return false;
    }
    return true;
}

/**
 * Detect suspicious patterns suggesting OCR errors.
 *
 * Flags:
 * - 4+ consecutive '.' or '_' characters
 * - More than 50% special characters ('.' + '_')
 * - Length >= 5 with zero vowels (likely garbled)
 */
export function hasUnusualPattern(username: string): boolean {
    if (!username) {
        return true;
    }

    if (REPEATED_SPECIAL_RE.test(username)) {
        return true;
    }

    let specialCount = 0;
    for (const ch of username) {
        if (ch === "." || ch === "_") {
            specialCount += 1;
        }
    }
    if (username.length > 0 && specialCount / username.length > 0.5) {
        return true;
    }

    if (username.length >= 5) {
        const lower = username.toLowerCase();
        let hasVowel = false;
        for (const ch of lower) {
            if (VOWELS.has(ch)) {
                hasVowel = true;
                break;
            }
        }
        if (!hasVowel) {
            return true;
        }
    }

    return false;
}
