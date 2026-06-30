/**
 * Wire-format types for the live job stream.
 *
 * Flow: queue consumer → `broadcastToJob()` → `JobCoordinator` DO → browser WS.
 *
 * `Message` (discriminated union) is the canonical envelope. Keys are
 * intentionally snake_case to match the PRD spec and avoid client-side
 * remapping — do NOT camelCase them.
 *
 * `JobItemUpdate` / `JobStreamMessage` are legacy shapes still consumed by the
 * in-progress UI; new producers must emit `Message`.
 */

import type { Platform, ExtractionKind } from "$lib/social/platform";

export type NotionStatus = "added" | "invalid" | "pending" | "unconfigured" | null;

export type ItemStatus = "pending" | "running" | "verified" | "review" | "failed" | "duplicate";

export type JobStatus = "pending" | "running" | "completed" | "cancelled" | "failed";

export type Tier = "HIGH" | "MED" | null;

/** Per-item completion payload. Matches PRD §WebSocket message contract. */
export interface ItemCompletedResult {
    username: string | null;
    /** Detected platform, or null when extraction yielded no username. */
    platform: Platform | null;
    /** 'handle' | 'display_name' | null. */
    kind: ExtractionKind | null;
    /** Canonical profile URL; null for display-name leads / the `other` platform / no username. */
    profile_url: string | null;
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

/** Canonical WebSocket envelope. Discriminated on `type`. */
export type Message =
    | { type: "item.started"; job_id: string; item_id: string; filename: string }
    | {
          type: "item.completed";
          job_id: string;
          item_id: string;
          result: ItemCompletedResult;
          /** Item's `completedAt` (epoch ms). Drives reconnect resync (`?last_event_id=`). */
          event_id?: number;
      }
    | {
          type: "item.notion_updated";
          job_id: string;
          item_id: string;
          notion_status: NotionStatus;
          notion_page_id: string | null;
          error: string | null;
      }
    | {
          type: "item.failed";
          job_id: string;
          item_id: string;
          error: string;
          /** Item's `completedAt` (epoch ms). Drives reconnect resync (`?last_event_id=`). */
          event_id?: number;
      }
    | { type: "job.completed"; job_id: string; summary: JobCompletedSummary }
    | { type: "job.cancelled"; job_id: string };

/** Queue payload. Producer: `createJob`. Consumer: `src/lib/server/queue/consumer.ts`. */
export interface QueueMessage {
    job_id: string;
    item_id: string;
    r2_key: string;
    user_id: string;
    diagnostics: boolean;
    /** Cached AI Gateway slug. Env var `AI_GATEWAY_SLUG` (if set) wins over this. */
    ai_gateway_slug?: string;
}

// Legacy UI shapes below — kept for in-progress UI compatibility. New code must use `Message`.

/** Legacy per-item update consumed by the in-progress UI. Prefer `Message` variants. */
export interface JobItemUpdate {
    id: string;
    jobId: string;
    filename: string;
    status: ItemStatus;
    username: string | null;
    platform?: Platform | null;
    kind?: ExtractionKind | null;
    profileUrl?: string | null;
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

/** Legacy WS envelope. Superseded by `Message`. */
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
