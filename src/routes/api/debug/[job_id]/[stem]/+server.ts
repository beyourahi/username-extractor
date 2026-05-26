import type { RequestHandler } from "./$types";
import { error } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "$lib/server/db";

/**
 * GET `debug/<job_id>/<stem>_response.txt` from R2 — the diagnostics blob
 * written by the queue consumer when `jobs.diagnostics = 1`.
 *
 * Authorization MUST happen before R2 read: query `jobs.user_id = locals.userId`
 * first; do not leak R2 contents on a job owned by another user.
 *
 * 404 paths intentionally do NOT distinguish "job not found" from "blob
 * missing" beyond the response message — both surface as 404.
 */
export const GET: RequestHandler = async ({ params, locals, platform }) => {
    if (!locals.userId || !platform?.env) {
        throw error(503, "platform unavailable");
    }
    const db = getDb(platform);

    const jobRows = await db
        .select({ id: schema.jobs.id })
        .from(schema.jobs)
        .where(and(eq(schema.jobs.id, params.job_id), eq(schema.jobs.userId, locals.userId)))
        .limit(1);
    if (jobRows.length === 0) {
        throw error(404, "job not found");
    }

    const key = `debug/${params.job_id}/${params.stem}_response.txt`;
    const obj = await platform.env.R2.get(key);
    if (!obj) {
        throw error(404, "debug artifact not found");
    }

    return new Response(obj.body, {
        headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "private, no-store"
        }
    });
};
