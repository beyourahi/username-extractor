/**
 * Queue consumer — the heart of the pipeline.
 *
 * Each message is one image. We:
 *   1. Check idempotency (status === 'pending') and that the parent job is
 *      not cancelled/failed.
 *   2. Mark running, broadcast `item.started`.
 *   3. Pull bytes from R2, run the VLM, classify.
 *   4. Dedup against `leads` (exact + near via Levenshtein).
 *   5. Update `job_items`, INSERT into `leads` when verified + non-duplicate.
 *   6. Broadcast `item.completed`.
 *   7. Sync to Notion if configured; broadcast `item.notion_updated`.
 *   8. If this was the last in-flight item, run the post-job Notion dedup,
 *      compute the summary, update `jobs`, broadcast `job.completed`.
 *
 * Unexpected throws → `message.retry()` so the platform handles 3× retry
 * with DLQ. Expected failures (bad bytes, no parseable username) are
 * permanent and `message.ack()`'d.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Client } from "@notionhq/client";
import * as schema from "$lib/server/schema";
import { jobs, jobItems, leads, userSettings } from "$lib/server/schema";
import { extractUsernameFromImage } from "$lib/server/ai/extract";
import { findSimilarExisting } from "$lib/extract/distance";
import { emit } from "$lib/server/analytics";
import { syncLeadInline } from "$lib/server/notion/sync-one";
import { deduplicate, type NotionRow } from "$lib/notion/dedup";
import { decryptNotionToken, deriveTokenKey } from "$lib/server/crypto";
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
        // Broadcast is best-effort; D1 remains the durable record.
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

async function fetchRecentUsernames(db: Db, userId: string): Promise<string[]> {
    const rows = await db
        .select({ username: leads.username })
        .from(leads)
        .where(and(eq(leads.userId, userId), eq(leads.archived, 0)))
        .orderBy(sql`${leads.createdAt} DESC`)
        .limit(NEAR_DUP_CANDIDATE_LIMIT);
    return rows.map((r) => r.username);
}

async function existsExact(db: Db, userId: string, username: string): Promise<boolean> {
    const rows = await db
        .select({ id: leads.id })
        .from(leads)
        .where(and(eq(leads.userId, userId), sql`lower(${leads.username}) = lower(${username})`))
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
    // Item-status breakdown.
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

    // Notion breakdown on leads sourced from this job.
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

        // Pull all pages once. We use the dataSources query path so the
        // helper sees the same shape it does in the live path.
        const dbInfo = (await client.databases.retrieve({
            database_id: notionDatabaseId
        })) as unknown as {
            data_sources?: Array<{ id: string }>;
            properties?: Record<string, { type?: string }>;
        };
        const dataSourceId = dbInfo.data_sources?.[0]?.id ?? notionDatabaseId;

        // Detect property names — minimal heuristic that mirrors the manager.
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
        return { groups: 0, archived: 0 };
    }
}

async function processMessage(env: ConsumerEnv, db: Db, msg: QueueMessage): Promise<void> {
    const { job_id: jobId, item_id: itemId, r2_key: r2Key, user_id: userId, diagnostics } = msg;
    const startedAt = Date.now();

    // ---- Idempotency check ---------------------------------------------------
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
        await db
            .update(jobItems)
            .set({ status: "failed", error: "Job cancelled", completedAt: Date.now() })
            .where(eq(jobItems.id, itemId));
        await broadcast(env, jobId, {
            type: "item.failed",
            job_id: jobId,
            item_id: itemId,
            error: "Job cancelled"
        });
        return;
    }

    // ---- Mark running --------------------------------------------------------
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

    // ---- Load image ----------------------------------------------------------
    const obj = await env.R2.get(r2Key);
    if (!obj) {
        await db
            .update(jobItems)
            .set({ status: "failed", error: "R2 object missing", completedAt: Date.now() })
            .where(eq(jobItems.id, itemId));
        await broadcast(env, jobId, {
            type: "item.failed",
            job_id: jobId,
            item_id: itemId,
            error: "R2 object missing"
        });
        emit(env, "item_failed", { jobId, userId, itemId, r2Key, status: "r2_missing" });
        return;
    }
    const imageBytes = await obj.arrayBuffer();

    // ---- Extract -------------------------------------------------------------
    let extraction;
    try {
        extraction = await extractUsernameFromImage({ env, imageBytes });
    } catch (firstErr) {
        // One in-line retry before giving up.
        try {
            extraction = await extractUsernameFromImage({ env, imageBytes });
        } catch (secondErr) {
            const msgText = secondErr instanceof Error ? secondErr.message : String(firstErr);
            await db
                .update(jobItems)
                .set({ status: "failed", error: msgText, completedAt: Date.now() })
                .where(eq(jobItems.id, itemId));
            await broadcast(env, jobId, {
                type: "item.failed",
                job_id: jobId,
                item_id: itemId,
                error: msgText
            });
            emit(env, "item_failed", {
                jobId,
                userId,
                itemId,
                r2Key,
                status: "extract_error",
                durationMs: Date.now() - startedAt
            });
            return;
        }
    }

    // Diagnostics: persist raw text to R2.
    if (diagnostics && extraction.rawText) {
        const stem = filename.replace(/\.[^./]+$/, "") || itemId;
        const debugKey = `debug/${jobId}/${stem}_response.txt`;
        try {
            await env.R2.put(debugKey, extraction.rawText, {
                httpMetadata: { contentType: "text/plain" }
            });
        } catch {
            // Best-effort.
        }
    }

    // ---- No parseable username path -----------------------------------------
    if (!extraction.username) {
        await db
            .update(jobItems)
            .set({
                status: "failed",
                error: "no parseable username",
                rawModelResponse: diagnostics ? extraction.rawText : null,
                completedAt: Date.now()
            })
            .where(eq(jobItems.id, itemId));

        const result: ItemCompletedResult = {
            username: null,
            ig_url: null,
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
            result
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

    // ---- Dedup checks --------------------------------------------------------
    const username = extraction.username;
    const igUrl = `https://instagram.com/${username}`;
    let isDuplicate = false;
    let isNearDuplicate = false;
    let similarTo: string | null = null;
    let editDistance: number | null = null;

    if (await existsExact(db, userId, username)) {
        isDuplicate = true;
    } else {
        const candidates = await fetchRecentUsernames(db, userId);
        const sim = findSimilarExisting(username, candidates);
        if (sim) {
            isNearDuplicate = true;
            similarTo = sim.match;
            editDistance = sim.distance;
        }
    }

    // ---- Compute final item status ------------------------------------------
    let finalStatus: ItemCompletedResult["status"];
    if (isDuplicate) {
        finalStatus = "duplicate";
    } else if (isNearDuplicate) {
        finalStatus = "review";
    } else {
        finalStatus = extraction.status; // 'verified' | 'review'
    }

    await db
        .update(jobItems)
        .set({
            status: finalStatus,
            username,
            confidence: extraction.confidence,
            tier: extraction.tier,
            isDuplicate: isDuplicate ? 1 : 0,
            isNearDuplicate: isNearDuplicate ? 1 : 0,
            similarTo,
            editDistance,
            rawModelResponse: diagnostics ? extraction.rawText : null,
            completedAt: Date.now()
        })
        .where(eq(jobItems.id, itemId));

    // Insert lead row for verified non-duplicates.
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
                    igUrl,
                    tier: extraction.tier ?? "MED",
                    confidence: extraction.confidence,
                    sourceJobId: jobId,
                    notionStatus: "pending",
                    archived: 0,
                    createdAt: Date.now()
                })
                .onConflictDoNothing({
                    target: [leads.userId, leads.username]
                });
        } catch {
            // Unique-index race — treat as duplicate for downstream broadcast.
            leadId = null;
        }
    }

    const baseResult: ItemCompletedResult = {
        username,
        ig_url: igUrl,
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
        result: baseResult
    });
    emit(env, "item_completed", {
        jobId,
        userId,
        itemId,
        status: finalStatus,
        durationMs: Date.now() - startedAt
    });

    // ---- Notion sync (verified only) ----------------------------------------
    if (finalStatus === "verified" && leadId) {
        const notionCfg = await loadNotionConfig(db, userId);
        let notionStatus: NotionStatus = "unconfigured";
        let notionPageId: string | null = null;
        let notionError: string | null = null;

        if (notionCfg.tokenEncrypted && notionCfg.databaseId) {
            const result = await syncLeadInline({
                env,
                username,
                instagramUrl: igUrl,
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

async function maybeFinalizeJob(
    env: ConsumerEnv,
    db: Db,
    jobId: string,
    userId: string,
    jobStartedAt: number
): Promise<void> {
    const remaining = await inFlightCount(db, jobId);
    if (remaining > 0) return;

    const jobRows = await db
        .select({ status: jobs.status, createdAt: jobs.createdAt })
        .from(jobs)
        .where(eq(jobs.id, jobId))
        .limit(1);
    const jobRow = jobRows[0];
    if (!jobRow) return;
    if (jobRow.status === "completed" || jobRow.status === "cancelled") return;

    // ---- Post-job Notion dedup ----------------------------------------------
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
            // Skip dedup on decrypt failure.
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
            // Unexpected — let the platform retry.
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
