/**
 * Markdown → ordered, deduped list of Instagram handles.
 * Verbatim port of Python `notion_sync.py:24-69` (string-in/string-out
 * — no filesystem access, accepts uploaded file content directly).
 *
 * Accepted line shapes (first whitespace token after prefix stripping wins):
 *   `username`            plain
 *   `- username`          bullet (`-`, `*`, `•`)
 *   `1. username`         numbered
 *   `@username`           at-prefix (also stripped a second time after token split)
 *
 * Skipped: empty lines, lines starting with `#`.
 * Output: insertion-ordered Set semantics (first occurrence wins).
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

        // Strip prefixes individually. Python collapses these into one regex
        // `[-*•@]\s*` — splitting them here keeps order explicit and lets us
        // re-strip `@` after the whitespace-token split below.
        line = line.replace(LIST_PREFIX_RE, "");
        line = line.replace(NUMBERED_RE, "");
        line = line.replace(LEADING_AT_RE, "");
        line = line.trim();

        if (!line) {
            continue;
        }

        const token = line.split(/\s+/)[0];
        if (!token) {
            continue;
        }

        // Second `@` strip: catches `- @username` where the first pass left `@username`.
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
