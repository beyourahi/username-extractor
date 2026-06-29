/**
 * Verbatim port of Python validation helpers
 * (extract_usernames.py:470-522 — `is_valid_instagram_format`, `has_unusual_pattern`).
 * Used by `scoreConfidence` to weight VLM output.
 */

const VALID_CHARS_RE = /^[a-z0-9._]+$/;
const ALNUM_RE = /[a-z0-9]/;
const CONSECUTIVE_DOTS_RE = /\.\./;
const REPEATED_SPECIAL_RE = /[._]{4,}/;
const VOWELS = new Set(["a", "e", "i", "o", "u"]);

/**
 * Generic placeholder identifiers a VLM emits when it CAN'T actually read a handle —
 * it echoes the prompt's example concept ("Some Display Name", "My Channel", "Example
 * Name") instead. Without this guard those become `verified` leads (M-020). Matched on
 * a normalized form (lowercase, alnum-only) so spacing/punctuation variants collapse.
 */
const PLACEHOLDER_NAMES = new Set([
    "examplename",
    "exampleuser",
    "exampleusername",
    "examplehandle",
    "examplepage",
    "examplechannel",
    "exampleaccount",
    "exampleorg",
    "examplebrand",
    "example",
    "somedisplayname",
    "displayname",
    "mychannel",
    "channelname",
    "channel",
    "yourname",
    "yourusername",
    "yourhandle",
    "username",
    "usernamehere",
    "handle",
    "johndoe",
    "janedoe",
    "fullname",
    "firstlast",
    "namesurname",
    "pagename",
    "profilename",
    "accountname",
    "brandname",
    "companyname",
    "name",
    "profile",
    "user",
    "account",
    "notvisible",
    "nothandle",
    "nousername",
    "unknown",
    "none",
    "na"
]);

function normalizeName(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * True when the extracted identifier is a generic placeholder the model echoed instead
 * of a real handle. Callers MUST drop these (status → review, never stored as a lead).
 */
export function isPlaceholderName(s: string): boolean {
    if (!s) return false;
    return PLACEHOLDER_NAMES.has(normalizeName(s));
}

/**
 * Instagram handle format rules (all must pass):
 *   length ∈ [1, 30]; charset `[a-z0-9._]`; first char alphanumeric;
 *   does not end with `.`; no consecutive `..`.
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
 * True when `username` triggers any OCR-corruption heuristic:
 *   - 4+ consecutive `.` or `_`
 *   - >50% special chars (`.` + `_`)
 *   - length ≥ 5 with zero vowels (`aeiou`)
 * Empty input also returns true.
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
