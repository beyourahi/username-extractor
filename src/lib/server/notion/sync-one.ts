/**
 * Sync a single lead to Notion. Used both by the queue consumer (inline post-
 * extraction) and the explicit `/api/leads/[id]/notion-sync` route.
 *
 * Returns the resulting notion_status + page_id + optional error so callers
 * can persist + broadcast in one shot.
 */

import { and, eq } from "drizzle-orm";
import type { Db } from "$lib/server/db";
import { leads, userSettings } from "$lib/server/schema";
import { decryptNotionToken, deriveTokenKey } from "$lib/server/crypto";
import { NotionDatabaseManager } from "$lib/notion/manager";
import { validateUsernameCached } from "$lib/instagram/cache";
import type { NotionStatus } from "$lib/types/messages";

export interface SyncOneEnv {
    KV: KVNamespace;
    NOTION_TOKEN_ENCRYPTION_KEY: string;
}

export interface SyncOneInput {
    db: Db;
    env: SyncOneEnv;
    userId: string;
    leadId: string;
}

export interface SyncOneResult {
    notionStatus: NotionStatus;
    notionPageId: string | null;
    error: string | null;
}

/**
 * Inline variant used by the queue consumer, where the lead row may not be
 * persisted yet. The caller supplies the username + ig_url and any per-user
 * Notion credentials already loaded from `user_settings`.
 */
export interface SyncInlineInput {
    env: SyncOneEnv;
    username: string;
    instagramUrl: string;
    notionTokenEncrypted: Uint8Array | null;
    notionDatabaseId: string | null;
    skipValidation: boolean;
}

export async function syncLeadInline(input: SyncInlineInput): Promise<SyncOneResult> {
    if (!input.notionTokenEncrypted || !input.notionDatabaseId) {
        return { notionStatus: "unconfigured", notionPageId: null, error: null };
    }

    let token: string;
    try {
        const key = await deriveTokenKey(input.env.NOTION_TOKEN_ENCRYPTION_KEY);
        token = await decryptNotionToken(input.notionTokenEncrypted, key);
    } catch (err) {
        return {
            notionStatus: "pending",
            notionPageId: null,
            error: `Token decrypt failed: ${err instanceof Error ? err.message : String(err)}`
        };
    }

    if (!input.skipValidation) {
        try {
            const cached = await validateUsernameCached(input.env, input.username);
            if (!cached.exists) {
                return { notionStatus: "invalid", notionPageId: null, error: null };
            }
        } catch (err) {
            return {
                notionStatus: "pending",
                notionPageId: null,
                error: `IG validation failed: ${err instanceof Error ? err.message : String(err)}`
            };
        }
    }

    try {
        const mgr = new NotionDatabaseManager(token, input.notionDatabaseId);
        const { pageId } = await mgr.createPage({
            username: input.username,
            instagramUrl: input.instagramUrl
        });
        return { notionStatus: "added", notionPageId: pageId || null, error: null };
    } catch (err) {
        return {
            notionStatus: "pending",
            notionPageId: null,
            error: err instanceof Error ? err.message : String(err)
        };
    }
}

/**
 * Route-handler variant. Loads the lead + user settings, runs the inline
 * sync, persists the result.
 */
export async function syncOneLead(input: SyncOneInput): Promise<SyncOneResult> {
    const { db, env, userId, leadId } = input;

    const leadRows = await db
        .select({
            id: leads.id,
            username: leads.username,
            igUrl: leads.igUrl,
            userId: leads.userId
        })
        .from(leads)
        .where(and(eq(leads.id, leadId), eq(leads.userId, userId)))
        .limit(1);

    const lead = leadRows[0];
    if (!lead) {
        return { notionStatus: "pending", notionPageId: null, error: "Lead not found" };
    }

    const settingsRows = await db
        .select({
            tok: userSettings.notionTokenEncrypted,
            dbId: userSettings.notionDatabaseId,
            skip: userSettings.notionSkipValidation
        })
        .from(userSettings)
        .where(eq(userSettings.userId, userId))
        .limit(1);

    const s = settingsRows[0];
    const tokenBlob = s?.tok ?? null;
    const result = await syncLeadInline({
        env,
        username: lead.username,
        instagramUrl: lead.igUrl,
        notionTokenEncrypted: tokenBlob ? new Uint8Array(tokenBlob as ArrayBuffer) : null,
        notionDatabaseId: s?.dbId ?? null,
        skipValidation: (s?.skip ?? 0) === 1
    });

    await db
        .update(leads)
        .set({
            notionStatus: result.notionStatus,
            notionPageId: result.notionPageId,
            notionLastError: result.error
        })
        .where(eq(leads.id, leadId));

    return result;
}
