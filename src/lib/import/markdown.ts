/**
 * Parse Instagram usernames from a markdown document.
 *
 * Source: /Users/beyourahi/Desktop/projects/extract_usernames/extract_usernames/integrations/notion_sync.py:24-69
 *
 * String-in / string-out — the SvelteKit version receives uploaded file
 * contents directly rather than reading from a filesystem path.
 *
 * Handles:
 * - Plain usernames: `username1`
 * - Bullet lists: `- username1`, `* username1`, `• username1`
 * - Numbered lists: `1. username1`
 * - At-prefixed: `@username1`
 *
 * Comments / headers (lines starting with `#`) are skipped. Duplicates are
 * removed while preserving first-seen order.
 */

const LIST_PREFIX_RE = /^[-*•]\s*/;
const NUMBERED_RE = /^\d+\.\s*/;
const LEADING_AT_RE = /^@+/;

export function loadUsernamesFromMarkdown(content: string): string[] {
    if (!content) {
        return [];
    }

    const seen = new Set<string>();
    const usernames: string[] = [];

    for (const rawLine of content.split(/\r?\n/)) {
        let line = rawLine.trim();
        if (!line || line.startsWith("#")) {
            continue;
        }

        // Strip bullet/numbered/@ prefixes — Python applies once with a regex
        // that matches `[-*•@]`. We split @ out so we can also handle plain
        // `@username` with no bullet (the Python regex matches that too via
        // the `@` alternation since `\s*` allows zero spaces).
        line = line.replace(LIST_PREFIX_RE, "");
        line = line.replace(NUMBERED_RE, "");
        line = line.replace(LEADING_AT_RE, "");
        line = line.trim();

        if (!line) {
            continue;
        }

        // First whitespace-delimited token.
        const token = line.split(/\s+/)[0];
        if (!token) {
            continue;
        }

        // Additional cleanup: strip any remaining leading '@'.
        const cleaned = token.replace(LEADING_AT_RE, "").trim();
        if (!cleaned) {
            continue;
        }

        if (!seen.has(cleaned)) {
            seen.add(cleaned);
            usernames.push(cleaned);
        }
    }

    return usernames;
}
