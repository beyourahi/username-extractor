import type { PageServerLoad } from "./$types";
import { getDb, schema } from "$lib/server/db";
import { and, desc, eq, like, sql, isNull, type SQL } from "drizzle-orm";

const PAGE_SIZE = 50;

export const load: PageServerLoad = async ({ locals, platform, url }) => {
    if (!locals.userId || !platform?.env?.DB) {
        return {
            leads: [],
            page: 1,
            pageSize: PAGE_SIZE,
            total: 0,
            q: "",
            tier: "",
            notion: "",
            archived: false
        };
    }
    const db = getDb(platform);

    const q = (url.searchParams.get("q") ?? "").trim();
    const tier = url.searchParams.get("tier") ?? "";
    const notion = url.searchParams.get("notion") ?? "";
    const archived = url.searchParams.get("archived") === "1";
    const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
    const offset = (page - 1) * PAGE_SIZE;

    const conds: SQL[] = [eq(schema.leads.userId, locals.userId)];
    conds.push(eq(schema.leads.archived, archived ? 1 : 0));
    if (q) conds.push(like(schema.leads.username, `%${q.toLowerCase()}%`));
    if (tier === "HIGH" || tier === "MED") conds.push(eq(schema.leads.tier, tier));
    if (notion === "added" || notion === "invalid" || notion === "pending") {
        conds.push(eq(schema.leads.notionStatus, notion));
    } else if (notion === "unconfigured") {
        conds.push(isNull(schema.leads.notionStatus));
    }

    const where = and(...conds);

    const rows = await db
        .select()
        .from(schema.leads)
        .where(where)
        .orderBy(desc(schema.leads.createdAt))
        .limit(PAGE_SIZE)
        .offset(offset);

    const totals = await db
        .select({ c: sql<number>`COUNT(*)` })
        .from(schema.leads)
        .where(where);

    return {
        leads: rows,
        page,
        pageSize: PAGE_SIZE,
        total: totals[0]?.c ?? 0,
        q,
        tier,
        notion,
        archived
    };
};
