import type { RequestHandler } from "./$types";
import { error } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "$lib/server/db";

/**
 * WS upgrade proxy. Verifies `jobs.user_id = locals.userId` BEFORE forwarding to
 * the per-job JobCoordinator DO — otherwise an attacker who guesses a job UUID
 * could attach to another user's live stream.
 *
 * Normalizes the DO request URL to `https://do/ws?job_id&last_event_id` so the
 * DO can route by path (see `JobCoordinator.handleWebSocketUpgrade`).
 */
export const GET: RequestHandler = async ({ request, params, locals, platform, url }) => {
    if (!locals.userId || !platform?.env) {
        throw error(503, "platform unavailable");
    }
    if (request.headers.get("Upgrade") !== "websocket") {
        throw error(426, "expected websocket upgrade");
    }

    const db = getDb(platform);
    const rows = await db
        .select({ id: schema.jobs.id })
        .from(schema.jobs)
        .where(and(eq(schema.jobs.id, params.id), eq(schema.jobs.userId, locals.userId)))
        .limit(1);
    if (rows.length === 0) {
        throw error(404, "job not found");
    }

    const stub = platform.env.JOB_COORDINATOR.get(platform.env.JOB_COORDINATOR.idFromName(params.id));
    const lastEventId = url.searchParams.get("last_event_id") ?? "";
    const target = new URL("https://do/ws");
    target.searchParams.set("job_id", params.id);
    if (lastEventId) target.searchParams.set("last_event_id", lastEventId);

    return stub.fetch(target.toString(), {
        method: "GET",
        headers: request.headers
    });
};
