/**
 * Cancels a job. Two-step:
 *   1. UPDATE `jobs.status='cancelled'` scoped by `user_id` (ownership check).
 *   2. POST /cancel to the JobCoordinator DO so live WS clients get notified.
 *
 * IMPORTANT: queue messages already in flight ARE NOT drained. The consumer
 * re-reads `jobs.status` per-message and marks items `failed` with
 * `error="cancelled"`, so this is safe but not instant.
 *
 * Bug surface to watch: missing the DB-status check in the consumer would
 * cause cancelled jobs to keep writing leads. Do not remove that check.
 */

import { and, eq } from "drizzle-orm";
import type { Db } from "$lib/server/db";
import { jobs } from "$lib/server/schema";
import { emit } from "$lib/server/analytics";

interface CancelEnv {
    JOB_COORDINATOR: DurableObjectNamespace;
    ANALYTICS?: AnalyticsEngineDataset;
}

export interface CancelJobInput {
    db: Db;
    env: CancelEnv;
    userId: string;
    jobId: string;
}

export async function cancelJob(input: CancelJobInput): Promise<{ cancelled: boolean }> {
    const { db, env, userId, jobId } = input;

    const res = await db
        .update(jobs)
        .set({ status: "cancelled", completedAt: Date.now() })
        .where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)))
        .returning({ id: jobs.id });

    if (res.length === 0) {
        return { cancelled: false };
    }

    try {
        const stub = env.JOB_COORDINATOR.get(env.JOB_COORDINATOR.idFromName(jobId));
        await stub.fetch("https://do/cancel", { method: "POST" });
    } catch {
        // DO unreachable. Acceptable: consumer reads `jobs.status` per message
        // and the UI WebSocket will reconnect and replay from D1.
    }

    emit(env, "job_cancelled", { jobId, userId });
    return { cancelled: true };
}
