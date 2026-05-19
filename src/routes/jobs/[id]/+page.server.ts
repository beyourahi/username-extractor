import type { PageServerLoad } from "./$types";
import { error } from "@sveltejs/kit";
import { getDb, schema } from "$lib/server/db";
import { eq, and, asc } from "drizzle-orm";

export const load: PageServerLoad = async ({ locals, platform, params, parent }) => {
    if (!locals.userId || !platform?.env?.DB) {
        throw error(503, "database unavailable");
    }
    const db = getDb(platform);

    const jobRows = await db
        .select()
        .from(schema.jobs)
        .where(and(eq(schema.jobs.id, params.id), eq(schema.jobs.userId, locals.userId)))
        .limit(1);

    if (jobRows.length === 0) {
        throw error(404, "job not found");
    }

    const items = await db
        .select()
        .from(schema.jobItems)
        .where(eq(schema.jobItems.jobId, params.id))
        .orderBy(asc(schema.jobItems.createdAt));

    const layout = await parent();
    const notionConfigured = Boolean(layout.userSettings?.notionDatabaseId);

    return { job: jobRows[0], items, notionConfigured };
};
