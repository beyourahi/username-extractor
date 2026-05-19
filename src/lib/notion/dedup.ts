/**
 * Notion Deduplicator — TypeScript port.
 *
 * Source: /Users/beyourahi/Desktop/projects/extract_usernames/extract_usernames/integrations/notion_deduplicator.py
 *
 * Smart deduplication. Groups Notion rows by Instagram URL, picks the best
 * username via scoring, archives losers (soft-delete via `pages.update`
 * with `archived: true`). Never hard-deletes.
 */

import type { Client } from "@notionhq/client";

export type KeepStrategy = "best" | "oldest" | "newest";

export interface NotionRow {
    pageId: string;
    username: string;
    url: string;
    createdAt: number;
}

export interface DedupResult {
    duplicateGroups: number;
    duplicatesFound: number;
    duplicatesRemoved: number;
    errors: Array<{ pageId: string; error: string }>;
    archivedPageIds: string[];
}

const NUMERIC_ONLY_RE = /^\d+\.?$/;
const ALPHA_RE = /[A-Za-z]/;
const DIGIT_RE = /\d/;
const DEFAULT_RATE_LIMIT_MS = 350;

function isAlpha(ch: string): boolean {
    return ALPHA_RE.test(ch);
}

function isDigit(ch: string): boolean {
    return DIGIT_RE.test(ch);
}

/**
 * Score a username's quality. Higher = better.
 *
 * Rules ported verbatim from `_score_username`:
 * - All-numeric (or e.g. "1.") → −1000
 * - Starts with digit → −50
 * - Starts with alpha → +100
 * - +floor(alphaRatio * 50) where alphaRatio = letters / max(1, len)
 * - Length 3–30 → +50, otherwise −20
 * - +2 per char up to a cap of 15 chars (max +30)
 * - All-lowercase (ignoring '_' and '.') → +10
 */
export function scoreUsername(username: string): number {
    if (!username) {
        return 0;
    }

    if (NUMERIC_ONLY_RE.test(username)) {
        return -1000;
    }

    let score = 0;
    const first = username[0] ?? "";

    if (isDigit(first)) {
        score -= 50;
    }
    if (isAlpha(first)) {
        score += 100;
    }

    let alphaCount = 0;
    for (const ch of username) {
        if (isAlpha(ch)) {
            alphaCount += 1;
        }
    }
    const alphaRatio = alphaCount / Math.max(1, username.length);
    score += Math.floor(alphaRatio * 50);

    if (username.length >= 3 && username.length <= 30) {
        score += 50;
    } else {
        score -= 20;
    }

    score += Math.min(username.length, 15) * 2;

    const stripped = username.replace(/[_.]/g, "");
    if (username === username.toLowerCase() || stripped === stripped.toLowerCase()) {
        score += 10;
    }

    return score;
}

/**
 * Group rows by URL. Returns only groups containing more than one entry.
 */
export function findDuplicates(rows: NotionRow[]): Map<string, NotionRow[]> {
    const groups = new Map<string, NotionRow[]>();
    for (const row of rows) {
        if (!row.url) {
            continue;
        }
        const existing = groups.get(row.url);
        if (existing) {
            existing.push(row);
        } else {
            groups.set(row.url, [row]);
        }
    }

    for (const [url, entries] of groups) {
        if (entries.length < 2) {
            groups.delete(url);
        }
    }

    return groups;
}

function pickWinner(entries: NotionRow[], strategy: KeepStrategy): NotionRow {
    if (entries.length === 0) {
        throw new Error("pickWinner called with empty group");
    }

    let winner = entries[0]!;

    if (strategy === "best") {
        let bestScore = scoreUsername(winner.username);
        for (let i = 1; i < entries.length; i++) {
            const candidate = entries[i]!;
            const score = scoreUsername(candidate.username);
            if (score > bestScore) {
                winner = candidate;
                bestScore = score;
            }
        }
        return winner;
    }

    if (strategy === "oldest") {
        for (let i = 1; i < entries.length; i++) {
            const candidate = entries[i]!;
            if (candidate.createdAt < winner.createdAt) {
                winner = candidate;
            }
        }
        return winner;
    }

    // newest
    for (let i = 1; i < entries.length; i++) {
        const candidate = entries[i]!;
        if (candidate.createdAt > winner.createdAt) {
            winner = candidate;
        }
    }
    return winner;
}

export interface DeduplicateOptions {
    client: Client;
    rows: NotionRow[];
    keepStrategy?: KeepStrategy;
    dryRun?: boolean;
    rateLimitMs?: number;
}

export async function deduplicate(opts: DeduplicateOptions): Promise<DedupResult> {
    const strategy: KeepStrategy = opts.keepStrategy ?? "best";
    const dryRun = opts.dryRun ?? false;
    const rateLimitMs = opts.rateLimitMs ?? DEFAULT_RATE_LIMIT_MS;

    const groups = findDuplicates(opts.rows);

    const result: DedupResult = {
        duplicateGroups: groups.size,
        duplicatesFound: 0,
        duplicatesRemoved: 0,
        errors: [],
        archivedPageIds: []
    };

    let lastRequestAt = 0;
    const throttle = async (): Promise<void> => {
        if (dryRun) {
            return;
        }
        const now = Date.now();
        if (lastRequestAt > 0) {
            const elapsed = now - lastRequestAt;
            if (elapsed < rateLimitMs) {
                await new Promise((resolve) => setTimeout(resolve, rateLimitMs - elapsed));
            }
        }
        lastRequestAt = Date.now();
    };

    for (const entries of groups.values()) {
        result.duplicatesFound += entries.length - 1;
        const winner = pickWinner(entries, strategy);

        for (const entry of entries) {
            if (entry.pageId === winner.pageId) {
                continue;
            }

            if (dryRun) {
                result.archivedPageIds.push(entry.pageId);
                continue;
            }

            try {
                await throttle();
                await opts.client.pages.update({
                    page_id: entry.pageId,
                    archived: true
                } as Parameters<typeof opts.client.pages.update>[0]);
                result.archivedPageIds.push(entry.pageId);
                result.duplicatesRemoved += 1;
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                result.errors.push({ pageId: entry.pageId, error: message });
            }
        }
    }

    return result;
}
