/**
 * JobCoordinator — per-job Durable Object, addressed by `idFromName(jobId)`.
 *
 * INVARIANT: D1 is the source of truth. This DO is a best-effort relay.
 * If it crashes or evicts, the consumer keeps writing to D1 and the UI
 * re-syncs on reconnect via `?last_event_id=`. NEVER use DO storage here for
 * durable state.
 *
 * HTTP surface (called via `JOB_COORDINATOR.get(id).fetch(...)`):
 *   GET  /ws?job_id&last_event_id   → 101 upgrade; on reconnect, replays D1 rows with completedAt ≤ last_event_id
 *   POST /broadcast    { message }  → fanout `message` to all hibernating sockets; on `job.completed`, persists `summary` to `jobs.dedup_summary` as a belt-and-braces write
 *   POST /cancel?job_id             → fanout `{type:"job.cancelled"}` then close all sockets with 1000
 *
 * WebSockets use the hibernation API (`ctx.acceptWebSocket`) — no in-memory
 * connection map needed; runtime tracks sockets by tag.
 *
 * Clients are read-only on the wire; `webSocketMessage` drops payloads to
 * keep the association alive but does not interpret them.
 */

import { DurableObject } from "cloudflare:workers";
import { and, eq, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "$lib/server/schema";
import { buildProfileUrl, type ExtractionKind, type Platform } from "$lib/social/platform";
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
            // Replay completed items. Fire-and-forget so a slow D1 query never blocks the 101 upgrade.
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
            // Pre-multi-platform rows have null platform/kind — fall back to Instagram handle.
            const platform = (row.platform ?? "instagram") as Platform;
            const kind = (row.kind ?? "handle") as ExtractionKind;
            const result: ItemCompletedResult = {
                username: row.username,
                platform: row.username ? platform : null,
                kind: row.username ? kind : null,
                profile_url: buildProfileUrl(platform, row.username, kind),
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
                // Drop dead sockets silently; hibernation API does its own GC.
            }
        }

        // Safety net: also persist `summary` to `jobs.dedup_summary` so the
        // job detail page can render totals after a hard reload. The queue
        // consumer is the primary writer; this duplicate write is idempotent.
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
                // Non-fatal — consumer write already covers durability.
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
                // Socket already torn down.
            }
        }
        return new Response("ok");
    }

    override webSocketMessage(_ws: WebSocket, _message: string | ArrayBuffer): void {
        // Clients are read-only. Drop inbound frames; presence-only handler keeps the socket associated with this DO.
    }

    override webSocketClose(_ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): void {
        // No teardown needed — hibernation API GCs sockets by tag.
    }

    override webSocketError(_ws: WebSocket, _error: unknown): void {
        // Surfaces in Workers observability; no action required here.
    }
}
