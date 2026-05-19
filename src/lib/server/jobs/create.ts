/**
 * Create a job: validate quota → upload to R2 → insert rows → enqueue.
 *
 * All steps for a single batch run in a single function so the caller can
 * surface a single user-facing error and the analytics path is consistent.
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
}

export interface CreateJobResult {
    jobId: string;
    itemCount: number;
}

const DEFAULT_DAILY_QUOTA = 1000;
const VLM_MODEL = "@cf/moonshot/kimi-k2.6";

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

export async function createJob(input: CreateJobInput): Promise<CreateJobResult> {
    const { db, env, userId, files, diagnostics } = input;

    if (files.length === 0) {
        throw new Error("createJob: at least one file is required");
    }

    // ---- Quota check -----------------------------------------------------
    const [limit, used] = await Promise.all([loadQuota(db, userId), loadUsedToday(db, userId)]);
    if (used + files.length > limit) {
        throw new QuotaExceededError(used, limit, files.length);
    }

    // ---- Build IDs -------------------------------------------------------
    const jobId = crypto.randomUUID();
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

    // ---- Persist rows ----------------------------------------------------
    await db.insert(jobs).values({
        id: jobId,
        userId,
        status: "pending",
        vlmModel: VLM_MODEL,
        diagnostics: diagnostics ? 1 : 0,
        imageCount: files.length,
        createdAt: now
    });

    if (itemRows.length > 0) {
        await db.insert(jobItems).values(itemRows);
    }

    // ---- Enqueue ---------------------------------------------------------
    for (const m of queueMessages) {
        await env.QUEUE.send(m);
        emit(env, "item_queued", { jobId, userId, itemId: m.item_id });
    }

    emit(env, "job_created", { jobId, userId });

    return { jobId, itemCount: files.length };
}
