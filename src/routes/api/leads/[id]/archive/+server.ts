import type { RequestHandler } from "./$types";
import { error, json } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "$lib/server/db";

export const POST: RequestHandler = async ({ params, locals, platform }) => {
    if (!locals.userId || !platform?.env) {
        throw error(503, "platform unavailable");
    }
    const db = getDb(platform);
    const res = await db
        .update(schema.leads)
        .set({ archived: 1 })
        .where(and(eq(schema.leads.id, params.id), eq(schema.leads.userId, locals.userId)))
        .returning({ id: schema.leads.id });
    if (res.length === 0) {
        throw error(404, "lead not found");
    }
    return json({ ok: true });
};
