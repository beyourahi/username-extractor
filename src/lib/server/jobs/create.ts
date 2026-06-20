/**
 * Creates a job and its items.
 *
 * Pipeline (sequential — DO NOT reorder, downstream invariants depend on it):
 *   1. Quota check: `loadQuota + loadUsedToday`; throws `QuotaExceededError`.
 *   2. R2 upload of every file under `raw/<jobId>/<uuid>_<sanitized-name>`.
 *   3. INSERT `jobs` row, then bulk INSERT `job_items` rows.
 *   4. `QUEUE.send` per item to the `image-jobs` queue.
 *
 * Failure handling: R2 puts happen before D1 inserts, so a mid-loop R2 error
 * leaves orphan blobs (cleaned by the nightly sweep). A D1 failure after R2
 * also leaves orphans. NEVER move QUEUE.send before the D1 inserts —
 * consumers assume the `job_items` row exists.
 *
 * Quota uses UTC-day windowing summed from `jobs.image_count` since the start
 * of today. Default per-user limit: DEFAULT_DAILY_QUOTA.
 */

import { and, eq, gte, sql } from "drizzle-orm";
import type { Db } from "$lib/server/db";
import { jobs, jobItems, userSettings } from "$lib/server/schema";
import { emit } from "$lib/server/analytics";
import type { QueueMessage } from "$lib/types/messages";

export class QuotaExceededError extends Error {
    public readonly used: number;
    public readonly limit: number;
    public readonly requested: number;
    constructor(used: number, limit: number, requested: number) {
        super(`Daily image quota exceeded. Used ${used} / ${limit} images today; this batch requests ${requested}.`);
        this.name = "QuotaExceededError";
        this.used = used;
        this.limit = limit;
        this.requested = requested;
    }
}

interface CreateJobEnv {
    R2: R2Bucket;
    QUEUE: Queue<QueueMessage>;
    ANALYTICS?: AnalyticsEngineDataset;
    AI_GATEWAY_SLUG?: string;
}

export interface CreateJobInput {
    db: Db;
    env: CreateJobEnv;
    userId: string;
    files: File[];
    diagnostics: boolean;
    /**
     * Chunked-upload mode for large folders. When true the job is created with
     * `upload_complete = 0` (and may start with zero files); remaining images are
     * streamed in via `appendItemsToJob` and the client calls `/finalize` when done.
     */
    multi?: boolean;
    /** Declared total image count, used to reserve quota up front in multi mode. Defaults to `files.length`. */
    expectedTotal?: number;
}

export interface CreateJobResult {
    jobId: string;
    itemCount: number;
}

const DEFAULT_DAILY_QUOTA = 50000;
const VLM_MODEL = "@cf/moonshotai/kimi-k2.6";

function sanitizeFilename(name: string): string {
    return (
        name
            .toLowerCase()
            .replace(/[^a-z0-9._-]+/g, "_")
            .replace(/^_+|_+$/g, "")
            .slice(0, 120) || "image"
    );
}

function startOfUtcDay(now: number): number {
    const d = new Date(now);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

async function loadQuota(db: Db, userId: string): Promise<number> {
    const row = await db
        .select({ q: userSettings.dailyImageQuota })
        .from(userSettings)
        .where(eq(userSettings.userId, userId))
        .limit(1);
    const first = row[0];
    if (!first || first.q == null) {
        return DEFAULT_DAILY_QUOTA;
    }
    return first.q;
}

async function loadUsedToday(db: Db, userId: string): Promise<number> {
    const since = startOfUtcDay(Date.now());
    const rows = await db
        .select({ total: sql<number>`COALESCE(SUM(${jobs.imageCount}), 0)` })
        .from(jobs)
        .where(and(eq(jobs.userId, userId), gte(jobs.createdAt, since)));
    const first = rows[0];
    if (!first) return 0;
    const total = first.total;
    return typeof total === "number" ? total : Number(total ?? 0);
}

export interface AppendItemsInput {
    db: Db;
    env: CreateJobEnv;
    jobId: string;
    userId: string;
    files: File[];
    diagnostics: boolean;
}

/**
 * Uploads a chunk of files to R2, inserts their `job_items` rows, bumps
 * `jobs.image_count`, then enqueues one message per item. Shared by `createJob`
 * (initial files) and the `/api/jobs/[id]/items` append endpoint (later chunks).
 *
 * Ordering invariant (DO NOT reorder): R2 put → `job_items` INSERT → `QUEUE.send`.
 * The consumer assumes the row exists when it dequeues. A mid-loop R2/D1 failure
 * leaves orphan blobs/rows that the nightly sweep reaps; the client retries the chunk.
 * The caller MUST have already inserted the parent `jobs` row (FK target).
 */
export async function appendItemsToJob(input: AppendItemsInput): Promise<number> {
    const { db, env, jobId, userId, files, diagnostics } = input;
    if (files.length === 0) return 0;

    const now = Date.now();
    type ItemRow = typeof jobItems.$inferInsert;
    const itemRows: ItemRow[] = [];
    const queueMessages: QueueMessage[] = [];

    for (const file of files) {
        const itemId = crypto.randomUUID();
        const r2Key = `raw/${jobId}/${crypto.randomUUID()}_${sanitizeFilename(file.name)}`;

        await env.R2.put(r2Key, await file.arrayBuffer(), {
            httpMetadata: { contentType: file.type || "application/octet-stream" }
        });

        itemRows.push({
            id: itemId,
            jobId,
            filename: file.name,
            r2Key,
            status: "pending",
            isDuplicate: 0,
            isNearDuplicate: 0,
            createdAt: now
        } satisfies ItemRow);

        const msg: QueueMessage = {
            job_id: jobId,
            item_id: itemId,
            r2_key: r2Key,
            user_id: userId,
            diagnostics
        };
        if (env.AI_GATEWAY_SLUG) {
            msg.ai_gateway_slug = env.AI_GATEWAY_SLUG;
        }
        queueMessages.push(msg);
    }

    // D1 caps bound parameters per query (~100). Each row binds ~8, so a 50-image
    // chunk in one INSERT would blow the limit — sub-batch the insert to stay under it.
    const INSERT_BATCH = 10;
    for (let i = 0; i < itemRows.length; i += INSERT_BATCH) {
        await db.insert(jobItems).values(itemRows.slice(i, i + INSERT_BATCH));
    }
    await db
        .update(jobs)
        .set({ imageCount: sql`${jobs.imageCount} + ${itemRows.length}` })
        .where(eq(jobs.id, jobId));

    // Enqueue last — job_items rows MUST exist by now (consumer reads them).
    for (const m of queueMessages) {
        await env.QUEUE.send(m);
        emit(env, "item_queued", { jobId, userId, itemId: m.item_id });
    }

    return itemRows.length;
}

export async function createJob(input: CreateJobInput): Promise<CreateJobResult> {
    const { db, env, userId, files, diagnostics, multi = false, expectedTotal } = input;

    if (!multi && files.length === 0) {
        throw new Error("createJob: at least one file is required");
    }

    // Step 1: quota. Multi mode reserves against the client-declared total so the
    // whole folder is admitted (or rejected) up front rather than mid-upload.
    const reserve = multi ? Math.max(expectedTotal ?? files.length, files.length) : files.length;
    const [limit, used] = await Promise.all([loadQuota(db, userId), loadUsedToday(db, userId)]);
    if (used + reserve > limit) {
        throw new QuotaExceededError(used, limit, reserve);
    }

    const jobId = crypto.randomUUID();
    const now = Date.now();

    // Step 2: create the parent job row first (job_items FK target). image_count
    // starts at 0 and is bumped by appendItemsToJob as chunks land.
    await db.insert(jobs).values({
        id: jobId,
        userId,
        status: "pending",
        vlmModel: VLM_MODEL,
        diagnostics: diagnostics ? 1 : 0,
        imageCount: 0,
        uploadComplete: multi ? 0 : 1,
        createdAt: now
    });

    // Step 3: upload + enqueue any initial files (none in pure chunked mode).
    const itemCount = await appendItemsToJob({ db, env, jobId, userId, files, diagnostics });

    emit(env, "job_created", { jobId, userId });

    return { jobId, itemCount };
}
