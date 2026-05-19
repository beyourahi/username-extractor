/**
 * JobCoordinator — per-job Durable Object.
 *
 * Responsibilities:
 * - Hold one WebSocket-per-client (via the hibernation API) for the lifetime
 *   of the job.
 * - Receive `POST /broadcast` from the queue consumer and fan messages out.
 * - Receive `POST /cancel` from the cancel route handler; broadcast then
 *   close.
 * - On reconnect with `?last_event_id=...`, replay completed items from D1
 *   so the client can resync without reloading the page.
 *
 * The DO never writes to D1 itself for the live path — it is a broadcast
 * relay. The consumer is the single source of truth.
 */

import { DurableObject } from "cloudflare:workers";
import { and, eq, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "$lib/server/schema";
import type { ItemCompletedResult, Message, NotionStatus } from "$lib/types/messages";

interface JobCoordinatorEnv {
    DB: D1Database;
}

export class JobCoordinator extends DurableObject<JobCoordinatorEnv> {
    override async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);

        if (url.pathname === "/ws") {
            return this.handleWebSocketUpgrade(request, url);
        }

        if (url.pathname === "/broadcast" && request.method === "POST") {
            return this.handleBroadcast(request);
        }

        if (url.pathname === "/cancel" && request.method === "POST") {
            return this.handleCancel(url);
        }

        return new Response("Not found", { status: 404 });
    }

    private async handleWebSocketUpgrade(request: Request, url: URL): Promise<Response> {
        if (request.headers.get("Upgrade") !== "websocket") {
            return new Response("Expected WebSocket upgrade", { status: 426 });
        }

        const pair = new WebSocketPair();
        const client = pair[0];
        const server = pair[1];

        this.ctx.acceptWebSocket(server);

        const jobId = url.searchParams.get("job_id") ?? "";
        const lastEventIdRaw = url.searchParams.get("last_event_id");
        const lastEventId = lastEventIdRaw ? Number(lastEventIdRaw) : null;

        if (jobId && lastEventId !== null && Number.isFinite(lastEventId)) {
            // Replay completed items. Best-effort — failures are swallowed so
            // a slow D1 doesn't stall the upgrade.
            this.replayCompletedItems(server, jobId, lastEventId).catch(() => {});
        }

        return new Response(null, { status: 101, webSocket: client });
    }

    private async replayCompletedItems(ws: WebSocket, jobId: string, sinceMs: number): Promise<void> {
        const db = drizzle(this.env.DB, { schema });
        const rows = await db
            .select()
            .from(schema.jobItems)
            .where(and(eq(schema.jobItems.jobId, jobId), lte(schema.jobItems.completedAt, sinceMs)));

        for (const row of rows) {
            if (row.status === "pending" || row.status === "running") continue;
            const itemStatus = row.status as ItemCompletedResult["status"];
            const result: ItemCompletedResult = {
                username: row.username,
                ig_url: row.username ? `https://instagram.com/${row.username}` : null,
                confidence: row.confidence ?? 0,
                tier: (row.tier as "HIGH" | "MED" | null) ?? null,
                status: itemStatus,
                is_duplicate: row.isDuplicate === 1,
                is_near_duplicate: row.isNearDuplicate === 1,
                similar_to: row.similarTo,
                edit_distance: row.editDistance,
                notion_status: null as NotionStatus,
                notion_page_id: null
            };
            const msg: Message = {
                type: "item.completed",
                job_id: jobId,
                item_id: row.id,
                result
            };
            try {
                ws.send(JSON.stringify(msg));
            } catch {
                return;
            }
        }
    }

    private async handleBroadcast(request: Request): Promise<Response> {
        let body: { message?: Message };
        try {
            body = (await request.json()) as { message?: Message };
        } catch {
            return new Response("Invalid JSON", { status: 400 });
        }
        if (!body.message) {
            return new Response("Missing 'message' field", { status: 400 });
        }

        const payload = JSON.stringify(body.message);
        for (const ws of this.ctx.getWebSockets()) {
            try {
                ws.send(payload);
            } catch {
                // Best-effort fanout; ignore individual socket errors.
            }
        }

        // Persist the final summary so a reload after job completion can still
        // render the totals card. The consumer also writes this — duplicate
        // writes are cheap and DO-side write is a safety net.
        if (body.message.type === "job.completed") {
            try {
                const db = drizzle(this.env.DB, { schema });
                await db
                    .update(schema.jobs)
                    .set({
                        dedupSummary: JSON.stringify(body.message.summary)
                    })
                    .where(eq(schema.jobs.id, body.message.job_id));
            } catch {
                // Non-fatal.
            }
        }

        return new Response("ok");
    }

    private async handleCancel(url: URL): Promise<Response> {
        const jobId = url.searchParams.get("job_id") ?? "";
        const msg: Message = { type: "job.cancelled", job_id: jobId };
        const payload = JSON.stringify(msg);
        for (const ws of this.ctx.getWebSockets()) {
            try {
                ws.send(payload);
                ws.close(1000, "job cancelled");
            } catch {
                // ignore
            }
        }
        return new Response("ok");
    }

    override webSocketMessage(_ws: WebSocket, _message: string | ArrayBuffer): void {
        // Clients are read-only in this design; we drop any inbound payloads
        // so the hibernation runtime keeps the socket associated.
    }

    override webSocketClose(_ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): void {
        // No teardown required — hibernation API tracks sockets via tags.
    }

    override webSocketError(_ws: WebSocket, _error: unknown): void {
        // No-op; surfaces in observability.
    }
}
