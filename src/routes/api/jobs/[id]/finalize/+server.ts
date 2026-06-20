import type { RequestHandler } from "./$types";
import { error, json } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "$lib/server/db";
import { maybeFinalizeJob } from "$lib/server/queue/consumer";

/**
 * POST `/api/jobs/[id]/finalize` — signal that a chunked folder upload is done.
 *
 * Sets `jobs.upload_complete = 1` (scoped to the owner), which unblocks
 * `maybeFinalizeJob`. We then call it once directly to cover the race where
 * every item finished processing *during* the upload — in that case no further
 * queue message will fire to trigger completion.
 */
export const POST: RequestHandler = async ({ params, locals, platform }) => {
    if (!locals.userId || !platform?.env) {
        throw error(503, "platform unavailable");
    }
    const db = getDb(platform);

    const res = await db
        .update(schema.jobs)
        .set({ uploadComplete: 1 })
        .where(and(eq(schema.jobs.id, params.id), eq(schema.jobs.userId, locals.userId)))
        .returning({ id: schema.jobs.id, createdAt: schema.jobs.createdAt });
    const row = res[0];
    if (!row) {
        throw error(404, "job not found");
    }

    try {
        await maybeFinalizeJob(platform.env, db, params.id, locals.userId, row.createdAt ?? Date.now());
    } catch {
        // Non-fatal: if items are still in flight, their completion will retry finalize.
    }

    return json({ ok: true });
};
