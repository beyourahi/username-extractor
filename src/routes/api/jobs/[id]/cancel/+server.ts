import type { RequestHandler } from "./$types";
import { error, json } from "@sveltejs/kit";
import { getDb } from "$lib/server/db";
import { cancelJob } from "$lib/server/jobs/cancel";

export const POST: RequestHandler = async ({ params, locals, platform }) => {
    if (!locals.userId || !platform?.env) {
        throw error(503, "platform unavailable");
    }
    const db = getDb(platform);
    const result = await cancelJob({
        db,
        env: platform.env,
        userId: locals.userId,
        jobId: params.id
    });
    if (!result.cancelled) {
        throw error(404, "job not found");
    }
    return json({ ok: true });
};
