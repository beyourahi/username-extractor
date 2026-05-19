/**
 * Cancel an in-flight job. We:
 *   1. Mark the job row 'cancelled' (user-scoped).
 *   2. Notify the JobCoordinator DO so it broadcasts to live WS clients.
 *
 * In-flight queue messages will still run; the consumer is idempotent and
 * checks the job's status, marking items 'failed' with reason "cancelled".
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
        // DO unavailable — the consumer will pick up the status flip on its
        // next idempotency check.
    }

    emit(env, "job_cancelled", { jobId, userId });
    return { cancelled: true };
}
