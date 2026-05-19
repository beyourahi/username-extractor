import type { PageServerLoad } from "./$types";
import { getDb, schema } from "$lib/server/db";
import { desc, eq, and, sql } from "drizzle-orm";

const PAGE_SIZE = 25;

export const load: PageServerLoad = async ({ locals, platform, url }) => {
    if (!locals.userId || !platform?.env?.DB) {
        return { jobs: [], page: 1, pageSize: PAGE_SIZE, total: 0 };
    }
    const db = getDb(platform);

    const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
    const offset = (page - 1) * PAGE_SIZE;

    const rows = await db
        .select()
        .from(schema.jobs)
        .where(eq(schema.jobs.userId, locals.userId))
        .orderBy(desc(schema.jobs.createdAt))
        .limit(PAGE_SIZE)
        .offset(offset);

    // Per-job counts for verified / review / failed.
    const counts = await Promise.all(
        rows.map(async (j) => {
            const r = await db
                .select({
                    verified: sql<number>`SUM(CASE WHEN ${schema.jobItems.status} = 'verified' THEN 1 ELSE 0 END)`,
                    review: sql<number>`SUM(CASE WHEN ${schema.jobItems.status} = 'review' THEN 1 ELSE 0 END)`,
                    failed: sql<number>`SUM(CASE WHEN ${schema.jobItems.status} = 'failed' THEN 1 ELSE 0 END)`
                })
                .from(schema.jobItems)
                .where(eq(schema.jobItems.jobId, j.id));
            return { id: j.id, ...r[0] };
        })
    );

    const totals = await db
        .select({ c: sql<number>`COUNT(*)` })
        .from(schema.jobs)
        .where(eq(schema.jobs.userId, locals.userId));

    const merged = rows.map((j) => ({
        ...j,
        counts: counts.find((c) => c.id === j.id) ?? { verified: 0, review: 0, failed: 0 }
    }));

    return {
        jobs: merged,
        page,
        pageSize: PAGE_SIZE,
        total: totals[0]?.c ?? 0
    };
};

// Silence unused import warning when no filter is used.
void and;
