import type { RequestHandler } from "./$types";
import { error } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "$lib/server/db";

/**
 * Returns the raw VLM response text saved during diagnostics mode.
 *
 * Ownership is enforced by joining job_id → user_id before reading R2.
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
