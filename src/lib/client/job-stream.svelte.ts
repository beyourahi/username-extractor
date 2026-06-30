/**
 * Svelte 5 runes-backed client store for the live job WebSocket.
 *
 * Connects to `/api/jobs/:id/ws` (proxied to the JobCoordinator DO).
 * Consumers may read `store.state.items` / `.completed` / `.cancelled`
 * directly inside `$derived(...)` — `state` is a single `$state` object so
 * Svelte tracks dependencies field-by-field.
 *
 * Reconnect:
 *   - Backoff: 1s, 2s, 4s, 8s, 8s (cap), max MAX_RECONNECT attempts.
 *   - On reconnect: forwards `state.lastEventId` as `?last_event_id=` so the
 *     DO replays D1-persisted completions the client missed.
 *   - No reconnect when `closed`, `completed`, or `cancelled`.
 *
 * The server NEVER reads from the socket (DO `webSocketMessage` is a no-op).
 * This module sends nothing — it's a one-way subscription.
 */
import type { Message, ItemCompletedResult, NotionStatus } from "$lib/types/messages";

export type LiveItem = {
    item_id: string;
    filename: string;
    status: "pending" | "running" | "verified" | "review" | "failed" | "duplicate";
    result?: ItemCompletedResult;
    error?: string | null;
    notion_status?: NotionStatus;
    notion_page_id?: string | null;
};

export interface JobStreamState {
    connected: boolean;
    error: string | null;
    items: Record<string, LiveItem>;
    completed: boolean;
    cancelled: boolean;
    lastEventId: number;
}

const MAX_RECONNECT = 5;

export function createJobStream(jobId: string) {
    const state = $state<JobStreamState>({
        connected: false,
        error: null,
        items: {},
        completed: false,
        cancelled: false,
        lastEventId: 0
    });

    let ws: WebSocket | null = null;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    function connect() {
        if (closed || typeof window === "undefined") return;
        const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
        const url = `${proto}//${window.location.host}/api/jobs/${jobId}/ws${
            state.lastEventId ? `?last_event_id=${state.lastEventId}` : ""
        }`;
        try {
            ws = new WebSocket(url);
        } catch (e) {
            state.error = e instanceof Error ? e.message : "ws-open-failed";
            scheduleReconnect();
            return;
        }

        ws.onopen = () => {
            state.connected = true;
            state.error = null;
            attempt = 0;
        };

        ws.onmessage = (ev) => {
            try {
                const msg = JSON.parse(ev.data) as Message & { event_id?: number };
                if (typeof msg.event_id === "number") {
                    state.lastEventId = Math.max(state.lastEventId, msg.event_id);
                }
                applyMessage(msg);
            } catch (e) {
                state.error = e instanceof Error ? e.message : "parse-error";
            }
        };

        ws.onerror = () => {
            state.error = "ws-error";
        };

        ws.onclose = () => {
            state.connected = false;
            if (!closed && !state.completed && !state.cancelled) {
                scheduleReconnect();
            }
        };
    }

    function applyMessage(msg: Message) {
        switch (msg.type) {
            case "item.started": {
                state.items[msg.item_id] = {
                    item_id: msg.item_id,
                    filename: msg.filename,
                    status: "running"
                };
                break;
            }
            case "item.completed": {
                const existing = state.items[msg.item_id];
                state.items[msg.item_id] = {
                    item_id: msg.item_id,
                    filename: existing?.filename ?? msg.item_id,
                    status: msg.result.status,
                    result: msg.result,
                    notion_status: msg.result.notion_status,
                    notion_page_id: msg.result.notion_page_id
                };
                break;
            }
            case "item.notion_updated": {
                const existing = state.items[msg.item_id];
                if (existing) {
                    state.items[msg.item_id] = {
                        ...existing,
                        notion_status: msg.notion_status,
                        notion_page_id: msg.notion_page_id,
                        error: msg.error
                    };
                }
                break;
            }
            case "item.failed": {
                const existing = state.items[msg.item_id];
                state.items[msg.item_id] = {
                    item_id: msg.item_id,
                    filename: existing?.filename ?? msg.item_id,
                    status: "failed",
                    error: msg.error
                };
                break;
            }
            case "job.completed": {
                state.completed = true;
                break;
            }
            case "job.cancelled": {
                state.cancelled = true;
                break;
            }
        }
    }

    function scheduleReconnect() {
        if (closed || attempt >= MAX_RECONNECT) {
            if (attempt >= MAX_RECONNECT) state.error = "reconnect-exhausted";
            return;
        }
        attempt++;
        const delay = Math.min(8000, 1000 * 2 ** (attempt - 1));
        timer = setTimeout(connect, delay);
    }

    function reconnect() {
        attempt = 0;
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        try {
            ws?.close();
        } catch {
            // Socket already closed; safe to ignore.
        }
        connect();
    }

    function close() {
        closed = true;
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        try {
            ws?.close();
        } catch {
            // Socket already closed; safe to ignore.
        }
    }

    connect();

    return {
        get state() {
            return state;
        },
        reconnect,
        close
    };
}
