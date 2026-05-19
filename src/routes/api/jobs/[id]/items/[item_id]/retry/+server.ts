import type { RequestHandler } from "./$types";
import { error, json } from "@sveltejs/kit";
import { getDb } from "$lib/server/db";
import { retryItem } from "$lib/server/jobs/retry-item";

export const POST: RequestHandler = async ({ params, locals, platform }) => {
    if (!locals.userId || !platform?.env) {
        throw error(503, "platform unavailable");
    }
    const db = getDb(platform);
    const result = await retryItem({
        db,
        env: platform.env,
        userId: locals.userId,
        jobId: params.id,
        itemId: params.item_id
    });
    if (!result.retried) {
        throw error(404, "item not found");
    }
    return json({ ok: true });
};
