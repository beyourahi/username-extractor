import type { RequestHandler } from "./$types";
import { error } from "@sveltejs/kit";
import { and, desc, eq, like, isNull, type SQL } from "drizzle-orm";
import { getDb, schema } from "$lib/server/db";
import { toCsv } from "$lib/utils/csv";

/**
 * GET `/api/leads?format=csv` — export the user's leads as CSV.
 *
 * Mirrors the filter logic in `src/routes/leads/+page.server.ts` (q / tier /
 * notion / archived) but without pagination, so the download reflects the exact
 * filtered view the user is looking at. Scoped to the authenticated owner.
 */
export const GET: RequestHandler = async ({ url, locals, platform }) => {
    if (!locals.userId || !platform?.env?.DB) {
        throw error(503, "platform unavailable");
    }
    const db = getDb(platform);

    const q = (url.searchParams.get("q") ?? "").trim();
    const tier = url.searchParams.get("tier") ?? "";
    const notion = url.searchParams.get("notion") ?? "";
    const archived = url.searchParams.get("archived") === "1";

    const conds: SQL[] = [eq(schema.leads.userId, locals.userId), eq(schema.leads.archived, archived ? 1 : 0)];
    if (q) conds.push(like(schema.leads.username, `%${q.toLowerCase()}%`));
    if (tier === "HIGH" || tier === "MED") conds.push(eq(schema.leads.tier, tier));
    if (notion === "added" || notion === "invalid" || notion === "pending") {
        conds.push(eq(schema.leads.notionStatus, notion));
    } else if (notion === "unconfigured") {
        conds.push(isNull(schema.leads.notionStatus));
    }

    const rows = await db
        .select({
            username: schema.leads.username,
            igUrl: schema.leads.igUrl,
            tier: schema.leads.tier,
            confidence: schema.leads.confidence,
            notionStatus: schema.leads.notionStatus,
            createdAt: schema.leads.createdAt
        })
        .from(schema.leads)
        .where(and(...conds))
        .orderBy(desc(schema.leads.createdAt));

    const csv = toCsv(
        ["username", "ig_url", "tier", "confidence", "notion_status", "created_at"],
        rows.map((r) => [
            r.username,
            r.igUrl,
            r.tier,
            r.confidence,
            r.notionStatus ?? "",
            new Date(r.createdAt).toISOString()
        ])
    );

    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
        headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": `attachment; filename="leads-${stamp}.csv"`
        }
    });
};
