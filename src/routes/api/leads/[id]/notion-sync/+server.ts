import type { RequestHandler } from "./$types";
import { error, json } from "@sveltejs/kit";
import { getDb } from "$lib/server/db";
import { syncOneLead } from "$lib/server/notion/sync-one";

export const POST: RequestHandler = async ({ params, locals, platform }) => {
    if (!locals.userId || !platform?.env) {
        throw error(503, "platform unavailable");
    }
    const db = getDb(platform);
    const result = await syncOneLead({
        db,
        env: platform.env,
        userId: locals.userId,
        leadId: params.id
    });
    return json({
        notionStatus: result.notionStatus,
        notionPageId: result.notionPageId,
        error: result.error
    });
};
