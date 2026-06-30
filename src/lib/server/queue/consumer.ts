/**
 * Image-jobs queue consumer — the main extraction pipeline.
 *
 * One message = one image. Per-message pipeline (`processMessage`):
 *   1. Idempotency: bail unless `job_items.status === 'pending'`.
 *   2. Parent-job liveness: if `jobs.status` is not pending/running, mark item failed.
 *   3. R2 GET → VLM extract (one inline retry on transport error).
 *   4. Dedup vs `leads` (`existsExact`, then Levenshtein via `findSimilarExisting`).
 *   5. Compute final status: duplicate > near-dup → review > extraction.status.
 *   6. UPDATE `job_items`; INSERT `leads` for `verified` non-duplicates.
 *   7. Broadcast `item.completed`.
 *   8. Per-user Notion sync via `syncLeadInline`; broadcast `item.notion_updated`.
 *   9. `maybeFinalizeJob`: when no `pending|running` items remain → run post-job
 *      Notion dedup, write summary, broadcast `job.completed`.
 *
 * Error policy:
 *   - Expected failures (R2 miss, unparseable VLM output) → ack + record in D1.
 *   - Unexpected throws → `message.retry()` (queue retries 3×, then DLQ).
 *
 * INVARIANT: every D1 write must precede the matching broadcast. The UI is
 * a view onto D1; broadcasts are a hint, not a source of truth.
 *
 * INVARIANT: `processMessage` MUST be idempotent — at-least-once delivery.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Client } from "@notionhq/client";
import * as schema from "$lib/server/schema";
import { jobs, jobItems, leads, userSettings } from "$lib/server/schema";
import { extractUsernameFromImage } from "$lib/server/ai/extract";
import { loadCloudflareConfig, resolveCloudflareCreds } from "$lib/server/ai/cloudflare-config";
import { CfInferenceError } from "$lib/server/ai/run-rest";
import { itemErrorForCfError } from "$lib/server/ai/errors";
import { findSimilarExisting } from "$lib/extract/distance";
import { emit } from "$lib/server/analytics";
import { syncLeadInline } from "$lib/server/notion/sync-one";
import { deduplicate, type NotionRow } from "$lib/notion/dedup";
import { decryptNotionToken, deriveTokenKey } from "$lib/server/crypto";
import type { Platform } from "$lib/social/platform";
import type {
    ItemCompletedResult,
    JobCompletedSummary,
    Message,
    NotionStatus,
    QueueMessage
} from "$lib/types/messages";

type Db = ReturnType<typeof drizzle<typeof schema>>;

interface ConsumerEnv {
    DB: D1Database;
    R2: R2Bucket;
    KV: KVNamespace;
    AI: Ai;
    QUEUE: Queue<QueueMessage>;
    JOB_COORDINATOR: DurableObjectNamespace;
    ANALYTICS?: AnalyticsEngineDataset;
    NOTION_TOKEN_ENCRYPTION_KEY: string;
    AI_GATEWAY_SLUG?: string;
    AI_GATEWAY_TOKEN?: string;
}

const NEAR_DUP_CANDIDATE_LIMIT = 5000;

async function broadcast(env: ConsumerEnv, jobId: string, message: Message): Promise<void> {
    try {
        const stub = env.JOB_COORDINATOR.get(env.JOB_COORDINATOR.idFromName(jobId));
        await stub.fetch("https://do/broadcast", {
            method: "POST",
            body: JSON.stringify({ message }),
            headers: { "Content-Type": "application/json" }
        });
    } catch {
        // DO unreachable / hibernated. D1 is the source of truth; UI re-syncs on reconnect.
    }
}

interface UserNotionConfig {
    tokenEncrypted: Uint8Array | null;
    databaseId: string | null;
    skipValidation: boolean;
}

async function loadNotionConfig(db: Db, userId: string): Promise<UserNotionConfig> {
    const rows = await db
        .select({
            tok: userSettings.notionTokenEncrypted,
            dbId: userSettings.notionDatabaseId,
            skip: userSettings.notionSkipValidation
        })
        .from(userSettings)
        .where(eq(userSettings.userId, userId))
        .limit(1);
    const s = rows[0];
    if (!s) {
        return { tokenEncrypted: null, databaseId: null, skipValidation: false };
    }
    return {
        tokenEncrypted: s.tok ? new Uint8Array(s.tok as ArrayBuffer) : null,
        databaseId: s.dbId,
        skipValidation: (s.skip ?? 0) === 1
    };
}

// Dedup is scoped per-platform: @john on Instagram and @john on TikTok are different people.
async function fetchRecentUsernames(db: Db, userId: string, platform: Platform): Promise<string[]> {
    const rows = await db
        .select({ username: leads.username })
        .from(leads)
        .where(and(eq(leads.userId, userId), eq(leads.platform, platform), eq(leads.archived, 0)))
        .orderBy(sql`${leads.createdAt} DESC`)
        .limit(NEAR_DUP_CANDIDATE_LIMIT);
    return rows.map((r) => r.username);
}

async function existsExact(db: Db, userId: string, username: string, platform: Platform): Promise<boolean> {
    const rows = await db
        .select({ id: leads.id })
        .from(leads)
        .where(
            and(
                eq(leads.userId, userId),
                eq(leads.platform, platform),
                sql`lower(${leads.username}) = lower(${username})`
            )
        )
        .limit(1);
    return rows.length > 0;
}

async function isJobActive(db: Db, jobId: string): Promise<boolean> {
    const rows = await db.select({ status: jobs.status }).from(jobs).where(eq(jobs.id, jobId)).limit(1);
    const status = rows[0]?.status;
    return status === "pending" || status === "running";
}

async function inFlightCount(db: Db, jobId: string): Promise<number> {
    const rows = await db
        .select({ c: sql<number>`COUNT(*)` })
        .from(jobItems)
        .where(and(eq(jobItems.jobId, jobId), inArray(jobItems.status, ["pending", "running"])));
    const first = rows[0];
    if (!first) return 0;
    const c = first.c;
    return typeof c === "number" ? c : Number(c ?? 0);
}

interface JobAggregates {
    verified: number;
    review: number;
    failed: number;
    duplicate: number;
    notionAdded: number;
    notionInvalid: number;
    notionPending: number;
}

async function computeJobSummary(db: Db, jobId: string): Promise<JobAggregates> {
    // GROUP BY item status → verified/review/failed/duplicate.
    const itemRows = await db
        .select({ status: jobItems.status, c: sql<number>`COUNT(*)` })
        .from(jobItems)
        .where(eq(jobItems.jobId, jobId))
        .groupBy(jobItems.status);

    const out: JobAggregates = {
        verified: 0,
        review: 0,
        failed: 0,
        duplicate: 0,
        notionAdded: 0,
        notionInvalid: 0,
        notionPending: 0
    };
    for (const r of itemRows) {
        const n = typeof r.c === "number" ? r.c : Number(r.c ?? 0);
        if (r.status === "verified") out.verified = n;
        else if (r.status === "review") out.review = n;
        else if (r.status === "failed") out.failed = n;
        else if (r.status === "duplicate") out.duplicate = n;
    }

    // GROUP BY notion_status, scoped to leads with `source_job_id = jobId`.
    // `pending` + `unconfigured` are folded into `notionPending` for the UI.
    const notionRows = await db
        .select({ status: leads.notionStatus, c: sql<number>`COUNT(*)` })
        .from(leads)
        .where(eq(leads.sourceJobId, jobId))
        .groupBy(leads.notionStatus);
    for (const r of notionRows) {
        const n = typeof r.c === "number" ? r.c : Number(r.c ?? 0);
        if (r.status === "added") out.notionAdded = n;
        else if (r.status === "invalid") out.notionInvalid = n;
        else if (r.status === "pending" || r.status === "unconfigured") out.notionPending += n;
    }

    return out;
}

async function runPostJobDedup(
    notionToken: string,
    notionDatabaseId: string
): Promise<{ groups: number; archived: number }> {
    try {
        const client = new Client({ auth: notionToken });

        // Use `databases.retrieve` → `dataSources.query` to mirror the live-path shape
        // (see `NotionDatabaseManager`). Avoids divergent dedup behaviour vs the manager.
        const dbInfo = (await client.databases.retrieve({
            database_id: notionDatabaseId
        })) as unknown as {
            data_sources?: Array<{ id: string }>;
            properties?: Record<string, { type?: string }>;
        };
        const dataSourceId = dbInfo.data_sources?.[0]?.id ?? notionDatabaseId;

        // Property-name detection mirrors `NotionDatabaseManager`. Defaults match the
        // canonical user template; the loop overrides with the first matching property.
        const properties = dbInfo.properties ?? {};
        let titleName = "Brand Name";
        let urlName = "Social Media Account";
        for (const [name, p] of Object.entries(properties)) {
            if (p.type === "title") titleName = name;
            if (p.type === "url" && name.toLowerCase().includes("social")) urlName = name;
        }
        if (!properties[urlName]) {
            for (const [name, p] of Object.entries(properties)) {
                if (p.type === "url") {
                    urlName = name;
                    break;
                }
            }
        }

        const rows: NotionRow[] = [];
        let cursor: string | undefined;
        let hasMore = true;
        while (hasMore) {
            const args: { data_source_id: string; page_size: number; start_cursor?: string } = {
                data_source_id: dataSourceId,
                page_size: 100
            };
            if (cursor) args.start_cursor = cursor;

            const res = (await client.dataSources.query(
                args as Parameters<typeof client.dataSources.query>[0]
            )) as unknown as {
                results?: Array<{
                    id: string;
                    properties?: Record<string, unknown>;
                    created_time?: string;
                }>;
                has_more?: boolean;
                next_cursor?: string | null;
            };
            for (const page of res.results ?? []) {
                const props = page.properties ?? {};
                const titleProp = props[titleName] as { title?: Array<{ plain_text?: string }> } | undefined;
                const urlProp = props[urlName] as { url?: string | null } | undefined;
                const username = titleProp?.title?.[0]?.plain_text?.trim() ?? "";
                const url = urlProp?.url ?? "";
                const createdAt = page.created_time ? Date.parse(page.created_time) : 0;
                if (username && url) {
                    rows.push({ pageId: page.id, username, url, createdAt });
                }
            }
            hasMore = Boolean(res.has_more);
            cursor = res.next_cursor ?? undefined;
        }

        const result = await deduplicate({
            client,
            rows,
            keepStrategy: "best",
            dryRun: false
        });
        return { groups: result.duplicateGroups, archived: result.duplicatesRemoved };
    } catch {
        // Best-effort. Job still finalizes; missing dedup just shows 0 groups in the summary.
        return { groups: 0, archived: 0 };
    }
}

async function processMessage(env: ConsumerEnv, db: Db, msg: QueueMessage): Promise<void> {
    const { job_id: jobId, item_id: itemId, r2_key: r2Key, user_id: userId, diagnostics } = msg;
    const startedAt = Date.now();

    // Idempotency: a retried message MUST be a no-op once the item has progressed past `pending`.
    const statusRows = await db
        .select({ status: jobItems.status })
        .from(jobItems)
        .where(eq(jobItems.id, itemId))
        .limit(1);
    const currentStatus = statusRows[0]?.status;
    if (!currentStatus || currentStatus !== "pending") {
        return;
    }

    if (!(await isJobActive(db, jobId))) {
        const completedAt = Date.now();
        await db
            .update(jobItems)
            .set({ status: "failed", error: "Job cancelled", completedAt })
            .where(eq(jobItems.id, itemId));
        await broadcast(env, jobId, {
            type: "item.failed",
            job_id: jobId,
            item_id: itemId,
            error: "Job cancelled",
            event_id: completedAt
        });
        return;
    }

    // Transition pending → running and notify the UI before any I/O.
    const itemMeta = await db
        .select({ filename: jobItems.filename })
        .from(jobItems)
        .where(eq(jobItems.id, itemId))
        .limit(1);
    const filename = itemMeta[0]?.filename ?? "";

    await db.update(jobItems).set({ status: "running" }).where(eq(jobItems.id, itemId));
    await broadcast(env, jobId, {
        type: "item.started",
        job_id: jobId,
        item_id: itemId,
        filename
    });
    emit(env, "item_started", { jobId, userId, itemId });

    const obj = await env.R2.get(r2Key);
    if (!obj) {
        const completedAt = Date.now();
        await db
            .update(jobItems)
            .set({ status: "failed", error: "R2 object missing", completedAt })
            .where(eq(jobItems.id, itemId));
        await broadcast(env, jobId, {
            type: "item.failed",
            job_id: jobId,
            item_id: itemId,
            error: "R2 object missing",
            event_id: completedAt
        });
        emit(env, "item_failed", { jobId, userId, itemId, r2Key, status: "r2_missing" });
        return;
    }
    const imageBytes = await obj.arrayBuffer();

    // Resolve the user's OWN Cloudflare account — inference is billed to them, not the owner.
    // Defense-in-depth: job creation already rejects unconnected users, but a job queued before
    // the user disconnected could still reach here, so re-check and fail the item cleanly.
    const cfResolved = await resolveCloudflareCreds(
        env.NOTION_TOKEN_ENCRYPTION_KEY,
        await loadCloudflareConfig(db, userId)
    ).catch(() => null);
    if (!cfResolved) {
        const errText = "No Cloudflare account connected — connect one in Settings.";
        const completedAt = Date.now();
        await db.update(jobItems).set({ status: "failed", error: errText, completedAt }).where(eq(jobItems.id, itemId));
        await broadcast(env, jobId, {
            type: "item.failed",
            job_id: jobId,
            item_id: itemId,
            error: errText,
            event_id: completedAt
        });
        emit(env, "item_failed", { jobId, userId, itemId, r2Key, status: "cf_not_connected" });
        await maybeFinalizeJob(env, db, jobId, userId, startedAt);
        return;
    }
    const { creds, model } = cfResolved;

    let extraction;
    try {
        extraction = await extractUsernameFromImage({ creds, model, imageBytes });
    } catch (firstErr) {
        // Auth / unavailable-model are terminal for this token+model — fail the item now;
        // a retry would just burn the queue budget on the same rejection.
        if (
            firstErr instanceof CfInferenceError &&
            (firstErr.kind === "auth" || firstErr.kind === "model_unavailable")
        ) {
            const errText = itemErrorForCfError(firstErr, model);
            const completedAt = Date.now();
            await db
                .update(jobItems)
                .set({ status: "failed", error: errText, completedAt })
                .where(eq(jobItems.id, itemId));
            await broadcast(env, jobId, {
                type: "item.failed",
                job_id: jobId,
                item_id: itemId,
                error: errText,
                event_id: completedAt
            });
            emit(env, "item_failed", { jobId, userId, itemId, r2Key, status: `cf_${firstErr.kind}` });
            await maybeFinalizeJob(env, db, jobId, userId, startedAt);
            return;
        }
        // Rate limited: revert to `pending` and let the queue redeliver with backoff. The
        // idempotency guard re-processes a `pending` item; leaving it `running` would no-op the retry.
        if (firstErr instanceof CfInferenceError && firstErr.kind === "rate_limit") {
            await db.update(jobItems).set({ status: "pending" }).where(eq(jobItems.id, itemId));
            throw firstErr;
        }
        // Transport / unknown: one inline retry (transient Workers AI 5xx), then fail (ack).
        try {
            extraction = await extractUsernameFromImage({ creds, model, imageBytes });
        } catch (secondErr) {
            const msgText = secondErr instanceof Error ? secondErr.message : String(firstErr);
            const completedAt = Date.now();
            await db
                .update(jobItems)
                .set({ status: "failed", error: msgText, completedAt })
                .where(eq(jobItems.id, itemId));
            await broadcast(env, jobId, {
                type: "item.failed",
                job_id: jobId,
                item_id: itemId,
                error: msgText,
                event_id: completedAt
            });
            emit(env, "item_failed", {
                jobId,
                userId,
                itemId,
                r2Key,
                status: "extract_error",
                durationMs: Date.now() - startedAt
            });
            await maybeFinalizeJob(env, db, jobId, userId, startedAt);
            return;
        }
    }

    // Diagnostics mode: persist raw VLM text to R2 under `debug/<jobId>/<stem>_response.txt`.
    // Read via `/api/debug/[job_id]/[stem]` when `jobs.diagnostics = 1`.
    if (diagnostics && extraction.rawText) {
        const stem = filename.replace(/\.[^./]+$/, "") || itemId;
        const debugKey = `debug/${jobId}/${stem}_response.txt`;
        try {
            await env.R2.put(debugKey, extraction.rawText, {
                httpMetadata: { contentType: "text/plain" }
            });
        } catch {
            // Non-fatal — diagnostics blob is purely a debugging aid.
        }
    }

    if (!extraction.username) {
        const completedAt = Date.now();
        await db
            .update(jobItems)
            .set({
                status: "failed",
                error: "no parseable username",
                rawModelResponse: diagnostics ? extraction.rawText : null,
                completedAt
            })
            .where(eq(jobItems.id, itemId));

        const result: ItemCompletedResult = {
            username: null,
            platform: extraction.platform,
            kind: extraction.kind,
            profile_url: null,
            confidence: 0,
            tier: null,
            status: "failed",
            is_duplicate: false,
            is_near_duplicate: false,
            similar_to: null,
            edit_distance: null,
            notion_status: null,
            notion_page_id: null
        };
        await broadcast(env, jobId, {
            type: "item.completed",
            job_id: jobId,
            item_id: itemId,
            result,
            event_id: completedAt
        });
        emit(env, "item_failed", {
            jobId,
            userId,
            itemId,
            r2Key,
            status: "no_username",
            durationMs: Date.now() - startedAt
        });
        await maybeFinalizeJob(env, db, jobId, userId, startedAt);
        return;
    }

    // Dedup: exact-match is cheap; near-dup (Levenshtein) only runs on a miss. Both scoped per-platform.
    const username = extraction.username;
    const platform = extraction.platform;
    const kind = extraction.kind;
    const profileUrl = extraction.profileUrl;
    let isDuplicate = false;
    let isNearDuplicate = false;
    let similarTo: string | null = null;
    let editDistance: number | null = null;

    if (await existsExact(db, userId, username, platform)) {
        isDuplicate = true;
    } else {
        const candidates = await fetchRecentUsernames(db, userId, platform);
        const sim = findSimilarExisting(username, candidates);
        if (sim) {
            isNearDuplicate = true;
            similarTo = sim.match;
            editDistance = sim.distance;
        }
    }

    // Status precedence: duplicate > near-dup (forces review) > extraction.status ('verified' | 'review').
    let finalStatus: ItemCompletedResult["status"];
    if (isDuplicate) {
        finalStatus = "duplicate";
    } else if (isNearDuplicate) {
        finalStatus = "review";
    } else {
        finalStatus = extraction.status;
    }

    const completedAt = Date.now();
    await db
        .update(jobItems)
        .set({
            status: finalStatus,
            username,
            platform,
            kind,
            confidence: extraction.confidence,
            tier: extraction.tier,
            isDuplicate: isDuplicate ? 1 : 0,
            isNearDuplicate: isNearDuplicate ? 1 : 0,
            similarTo,
            editDistance,
            rawModelResponse: diagnostics ? extraction.rawText : null,
            completedAt
        })
        .where(eq(jobItems.id, itemId));

    // Promote to a lifetime lead only when verified AND not a duplicate.
    let leadId: string | null = null;
    if (finalStatus === "verified" && !isDuplicate) {
        leadId = crypto.randomUUID();
        try {
            await db
                .insert(leads)
                .values({
                    id: leadId,
                    userId,
                    username,
                    platform,
                    profileUrl,
                    kind,
                    tier: extraction.tier ?? "MED",
                    confidence: extraction.confidence,
                    sourceJobId: jobId,
                    notionStatus: "pending",
                    archived: 0,
                    createdAt: Date.now()
                })
                .onConflictDoNothing({
                    target: [leads.userId, leads.username, leads.platform]
                });
        } catch {
            // `uniq_leads_user_username_platform` lost the race against a concurrent insert; treat as duplicate downstream.
            leadId = null;
        }
    }

    const baseResult: ItemCompletedResult = {
        username,
        platform,
        kind,
        profile_url: profileUrl,
        confidence: extraction.confidence,
        tier: extraction.tier,
        status: finalStatus,
        is_duplicate: isDuplicate,
        is_near_duplicate: isNearDuplicate,
        similar_to: similarTo,
        edit_distance: editDistance,
        notion_status: leadId ? "pending" : null,
        notion_page_id: null
    };
    await broadcast(env, jobId, {
        type: "item.completed",
        job_id: jobId,
        item_id: itemId,
        result: baseResult,
        event_id: completedAt
    });
    emit(env, "item_completed", {
        jobId,
        userId,
        itemId,
        status: finalStatus,
        durationMs: Date.now() - startedAt
    });

    // Notion sync runs inline on the consumer (not as a separate enqueue) so
    // `item.notion_updated` arrives in the same job lifecycle.
    if (finalStatus === "verified" && leadId) {
        const notionCfg = await loadNotionConfig(db, userId);
        let notionStatus: NotionStatus = "unconfigured";
        let notionPageId: string | null = null;
        let notionError: string | null = null;

        if (notionCfg.tokenEncrypted && notionCfg.databaseId) {
            const result = await syncLeadInline({
                env,
                username,
                platform,
                kind,
                profileUrl,
                notionTokenEncrypted: notionCfg.tokenEncrypted,
                notionDatabaseId: notionCfg.databaseId,
                skipValidation: notionCfg.skipValidation
            });
            notionStatus = result.notionStatus;
            notionPageId = result.notionPageId;
            notionError = result.error;
        }

        await db
            .update(leads)
            .set({
                notionStatus,
                notionPageId,
                notionLastError: notionError
            })
            .where(eq(leads.id, leadId));

        await broadcast(env, jobId, {
            type: "item.notion_updated",
            job_id: jobId,
            item_id: itemId,
            notion_status: notionStatus,
            notion_page_id: notionPageId,
            error: notionError
        });
    }

    await maybeFinalizeJob(env, db, jobId, userId, startedAt);
}

export async function maybeFinalizeJob(
    env: ConsumerEnv,
    db: Db,
    jobId: string,
    userId: string,
    jobStartedAt: number
): Promise<void> {
    const remaining = await inFlightCount(db, jobId);
    if (remaining > 0) return;

    const jobRows = await db
        .select({ status: jobs.status, createdAt: jobs.createdAt, uploadComplete: jobs.uploadComplete })
        .from(jobs)
        .where(eq(jobs.id, jobId))
        .limit(1);
    const jobRow = jobRows[0];
    if (!jobRow) return;
    if (jobRow.status === "completed" || jobRow.status === "cancelled") return;
    // Chunked folder upload still streaming: don't complete until the client
    // calls /finalize (sets upload_complete=1). Otherwise an early chunk draining
    // before later chunks arrive would prematurely mark the whole job done.
    if (!jobRow.uploadComplete) return;

    // Post-job Notion dedup: walks the user's Notion database and collapses
    // duplicates that may pre-date this job. See `src/lib/notion/dedup.ts`.
    let dedupGroups = 0;
    let dedupArchived = 0;
    const cfg = await loadNotionConfig(db, userId);
    if (cfg.tokenEncrypted && cfg.databaseId) {
        try {
            const key = await deriveTokenKey(env.NOTION_TOKEN_ENCRYPTION_KEY);
            const token = await decryptNotionToken(cfg.tokenEncrypted, key);
            const dedupRes = await runPostJobDedup(token, cfg.databaseId);
            dedupGroups = dedupRes.groups;
            dedupArchived = dedupRes.archived;
        } catch {
            // Skip dedup if the token blob can't be decrypted (key rotation, corruption).
        }
    }

    const aggregates = await computeJobSummary(db, jobId);
    const elapsed = Date.now() - (jobRow.createdAt ?? jobStartedAt);
    const summary: JobCompletedSummary = {
        verified_count: aggregates.verified,
        review_count: aggregates.review,
        failed_count: aggregates.failed,
        duplicate_count: aggregates.duplicate,
        notion_added_count: aggregates.notionAdded,
        notion_invalid_count: aggregates.notionInvalid,
        notion_pending_count: aggregates.notionPending,
        dedup_groups: dedupGroups,
        dedup_archived: dedupArchived,
        elapsed_ms: elapsed
    };

    await db
        .update(jobs)
        .set({
            status: "completed",
            completedAt: Date.now(),
            dedupSummary: JSON.stringify(summary)
        })
        .where(eq(jobs.id, jobId));

    await broadcast(env, jobId, {
        type: "job.completed",
        job_id: jobId,
        summary
    });
    emit(env, "job_completed", {
        jobId,
        userId,
        durationMs: elapsed,
        status: "completed"
    });
}

export const queueConsumer = async (
    batch: MessageBatch<QueueMessage>,
    env: ConsumerEnv,
    _ctx: ExecutionContext
): Promise<void> => {
    const db = drizzle(env.DB, { schema });

    for (const message of batch.messages) {
        try {
            await processMessage(env, db, message.body);
            message.ack();
        } catch (err) {
            // Unexpected. Queue contract: retry 3× then DLQ to `image-jobs-dlq`.
            emit(env, "queue_error", {
                jobId: message.body.job_id,
                userId: message.body.user_id,
                itemId: message.body.item_id,
                status: err instanceof Error ? err.message.slice(0, 80) : "unknown"
            });
            message.retry();
        }
    }
};
