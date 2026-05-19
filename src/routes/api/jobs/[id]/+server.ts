import type { RequestHandler } from "./$types";
import { error, json } from "@sveltejs/kit";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "$lib/server/db";

export const GET: RequestHandler = async ({ params, locals, platform }) => {
    if (!locals.userId || !platform?.env) {
        throw error(503, "platform unavailable");
    }
    const db = getDb(platform);

    const jobRows = await db
        .select()
        .from(schema.jobs)
        .where(and(eq(schema.jobs.id, params.id), eq(schema.jobs.userId, locals.userId)))
        .limit(1);
    const job = jobRows[0];
    if (!job) {
        throw error(404, "job not found");
    }

    const items = await db
        .select()
        .from(schema.jobItems)
        .where(eq(schema.jobItems.jobId, params.id))
        .orderBy(asc(schema.jobItems.createdAt));

    return json({ job, items });
};
