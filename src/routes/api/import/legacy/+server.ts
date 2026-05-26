/**
 * POST `/api/import/legacy` — one-off seed for the lifetime `leads` table.
 *
 * Accepts either or both:
 *   - `markdown`: raw text from the CLI's `verified_usernames.md` (parsed via `loadUsernamesFromMarkdown`).
 *   - `notion`:   credentials to pull all existing rows from a Notion DB (status set to `'added'`).
 *
 * Idempotent: duplicates are absorbed by `uniq_leads_user_username`. Rate-limited
 * in `hooks.server.ts` (5/min/user) — see `RATE_LIMIT_PATHS`.
 *
 * Tier/confidence are seeded as MED/85 for markdown imports because the
 * source has no scoring info. Markdown rows get `notion_status = null`;
 * Notion-sourced rows get `notion_status = 'added'`.
 */

import type { RequestHandler } from "./$types";
import { error, json } from "@sveltejs/kit";
import { getDb, schema } from "$lib/server/db";
import { loadUsernamesFromMarkdown } from "$lib/import/markdown";
import { NotionDatabaseManager } from "$lib/notion/manager";

interface LegacyImportBody {
    markdown?: string;
    notion?: {
        token: string;
        databaseId: string;
    };
}

interface LegacyImportResponse {
    imported_markdown: number;
    imported_notion: number;
    skipped: number;
}

export const POST: RequestHandler = async ({ request, locals, platform }) => {
    if (!locals.userId || !platform?.env) {
        throw error(503, "platform unavailable");
    }

    let body: LegacyImportBody;
    try {
        body = (await request.json()) as LegacyImportBody;
    } catch {
        throw error(400, "invalid JSON body");
    }

    if (!body.markdown && !body.notion) {
        throw error(400, "body must include either 'markdown' or 'notion'");
    }

    const db = getDb(platform);
    const userId = locals.userId;
    const now = Date.now();

    let importedMarkdown = 0;
    let importedNotion = 0;
    let totalAttempted = 0;

    async function insertLeads(usernames: Iterable<string>, notionStatus: string | null): Promise<number> {
        let inserted = 0;
        for (const raw of usernames) {
            const username = String(raw).trim().toLowerCase();
            if (!username) continue;
            totalAttempted += 1;
            const result = await db
                .insert(schema.leads)
                .values({
                    id: crypto.randomUUID(),
                    userId,
                    username,
                    igUrl: `https://instagram.com/${username}`,
                    tier: "MED",
                    confidence: 85,
                    sourceJobId: null,
                    notionPageId: null,
                    notionStatus,
                    notionLastError: null,
                    archived: 0,
                    createdAt: now
                })
                .onConflictDoNothing()
                .returning({ id: schema.leads.id });
            if (result.length > 0) inserted += 1;
        }
        return inserted;
    }

    if (typeof body.markdown === "string" && body.markdown.length > 0) {
        const usernames = loadUsernamesFromMarkdown(body.markdown);
        importedMarkdown = await insertLeads(usernames, null);
    }

    if (body.notion && body.notion.token && body.notion.databaseId) {
        let manager: NotionDatabaseManager;
        try {
            manager = new NotionDatabaseManager(body.notion.token, body.notion.databaseId);
        } catch (err) {
            throw error(400, err instanceof Error ? err.message : "invalid Notion credentials");
        }
        let existing: Set<string>;
        try {
            existing = await manager.getAllExistingUsernames();
        } catch (err) {
            throw error(502, err instanceof Error ? err.message : "Notion fetch failed");
        }
        importedNotion = await insertLeads(existing, "added");
    }

    const skipped = totalAttempted - importedMarkdown - importedNotion;
    const payload: LegacyImportResponse = {
        imported_markdown: importedMarkdown,
        imported_notion: importedNotion,
        skipped: Math.max(0, skipped)
    };
    return json(payload);
};
