import type { RequestHandler } from "./$types";
import { error } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "$lib/server/db";

/**
 * WebSocket entry point. Forwards the upgrade request to the per-job
 * Durable Object, which handles hibernation, broadcast, and replay.
 *
 * We resolve ownership BEFORE forwarding so an attacker can't bind a WS to
 * another user's job stream.
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
    // Forward to DO using a normalized URL so the DO sees /ws + query params.
    const lastEventId = url.searchParams.get("last_event_id") ?? "";
    const target = new URL("https://do/ws");
    target.searchParams.set("job_id", params.id);
    if (lastEventId) target.searchParams.set("last_event_id", lastEventId);

    return stub.fetch(target.toString(), {
        method: "GET",
        headers: request.headers
    });
};
