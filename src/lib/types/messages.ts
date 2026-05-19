/**
 * Shared client/server message types for the live job stream and lead views.
 *
 * Phase 3 message contract: WebSocket envelopes flow through the JobCoordinator
 * Durable Object → browser. The discriminated union `Message` is the canonical
 * wire format. Older snapshot/ping shapes are retained for backward compat with
 * the in-progress UI; new code should target `Message`.
 */

export type NotionStatus = "added" | "invalid" | "pending" | "unconfigured" | null;

export type ItemStatus = "pending" | "running" | "verified" | "review" | "failed" | "duplicate";

export type JobStatus = "pending" | "running" | "completed" | "cancelled" | "failed";

export type Tier = "HIGH" | "MED" | null;

/** Per-item completion payload (mirrors PRD §WebSocket message contract). */
export interface ItemCompletedResult {
    username: string | null;
    ig_url: string | null;
    confidence: number;
    tier: "HIGH" | "MED" | null;
    status: "verified" | "review" | "failed" | "duplicate";
    is_duplicate: boolean;
    is_near_duplicate: boolean;
    similar_to: string | null;
    edit_distance: number | null;
    notion_status: NotionStatus;
    notion_page_id: string | null;
}

export interface JobCompletedSummary {
    verified_count: number;
    review_count: number;
    failed_count: number;
    duplicate_count: number;
    notion_added_count: number;
    notion_invalid_count: number;
    notion_pending_count: number;
    dedup_groups: number;
    dedup_archived: number;
    elapsed_ms: number;
}

/**
 * Canonical WebSocket message envelope. Snake_case keys match the PRD wire
 * spec so the client can render without remapping.
 */
export type Message =
    | { type: "item.started"; job_id: string; item_id: string; filename: string }
    | {
          type: "item.completed";
          job_id: string;
          item_id: string;
          result: ItemCompletedResult;
      }
    | {
          type: "item.notion_updated";
          job_id: string;
          item_id: string;
          notion_status: NotionStatus;
          notion_page_id: string | null;
          error: string | null;
      }
    | { type: "item.failed"; job_id: string; item_id: string; error: string }
    | { type: "job.completed"; job_id: string; summary: JobCompletedSummary }
    | { type: "job.cancelled"; job_id: string };

/** Queue payload — emitted by `createJob`, consumed by the queue consumer. */
export interface QueueMessage {
    job_id: string;
    item_id: string;
    r2_key: string;
    user_id: string;
    diagnostics: boolean;
    /** Cached AI Gateway slug for routing (optional, env override wins). */
    ai_gateway_slug?: string;
}

/* ------------------------------------------------------------------------- */
/*  Backward-compat shapes retained for the in-progress UI.                  */
/* ------------------------------------------------------------------------- */

/** Live item update streamed from the Durable Object. (UI legacy shape.) */
export interface JobItemUpdate {
    id: string;
    jobId: string;
    filename: string;
    status: ItemStatus;
    username: string | null;
    confidence: number | null;
    tier: Tier;
    notionStatus?: NotionStatus;
    notionPageId?: string | null;
    isDuplicate?: boolean;
    isNearDuplicate?: boolean;
    similarTo?: string | null;
    editDistance?: number | null;
    error?: string | null;
}

/** Wrapper envelope sent over the WS channel. (UI legacy shape.) */
export interface JobStreamMessage {
    type: "item.update" | "job.update" | "snapshot" | "ping";
    eventId?: number;
    item?: JobItemUpdate;
    job?: {
        id: string;
        status: JobStatus;
        imageCount: number;
        dedupSummary?: string | null;
        completedAt?: number | null;
    };
}
