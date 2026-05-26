/**
 * Re-enqueues one job item. Ownership is enforced server-side by joining
 * `job_items → jobs` and matching `user_id`. Returns `{retried:false}` when
 * the item doesn't exist OR the requester doesn't own its parent job —
 * callers should map both to 404 (do NOT leak the distinction).
 *
 * Resets `status='pending'`, `error=null`, `completedAt=null` before send so
 * the consumer's update has a clean slate.
 */

import { and, eq } from "drizzle-orm";
import type { Db } from "$lib/server/db";
import { jobItems, jobs } from "$lib/server/schema";
import { emit } from "$lib/server/analytics";
import type { QueueMessage } from "$lib/types/messages";

interface RetryEnv {
    QUEUE: Queue<QueueMessage>;
    ANALYTICS?: AnalyticsEngineDataset;
    AI_GATEWAY_SLUG?: string;
}

export interface RetryItemInput {
    db: Db;
    env: RetryEnv;
    userId: string;
    jobId: string;
    itemId: string;
}

export async function retryItem(input: RetryItemInput): Promise<{ retried: boolean }> {
    const { db, env, userId, jobId, itemId } = input;

    const rows = await db
        .select({
            r2Key: jobItems.r2Key,
            jobUserId: jobs.userId,
            diagnostics: jobs.diagnostics
        })
        .from(jobItems)
        .innerJoin(jobs, eq(jobItems.jobId, jobs.id))
        .where(and(eq(jobItems.id, itemId), eq(jobItems.jobId, jobId)))
        .limit(1);

    const row = rows[0];
    if (!row || row.jobUserId !== userId) {
        return { retried: false };
    }

    await db.update(jobItems).set({ status: "pending", error: null, completedAt: null }).where(eq(jobItems.id, itemId));

    const msg: QueueMessage = {
        job_id: jobId,
        item_id: itemId,
        r2_key: row.r2Key,
        user_id: userId,
        diagnostics: row.diagnostics === 1
    };
    if (env.AI_GATEWAY_SLUG) {
        msg.ai_gateway_slug = env.AI_GATEWAY_SLUG;
    }

    await env.QUEUE.send(msg);
    emit(env, "item_retried", { jobId, userId, itemId });
    return { retried: true };
}
