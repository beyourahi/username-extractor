/**
 * Workers Analytics Engine emitter. No-op when the ANALYTICS binding is absent
 * (preview/test, or local dev without `wrangler dev`).
 *
 * Positional schema — DO NOT REORDER (dashboard SQL reads `blob1..blob6`):
 *   blobs:   [event, jobId, userId, itemId, status, r2Key]
 *   doubles: [durationMs]
 *   indexes: [userId]   ← keep low-cardinality
 *
 * `r2Key` (blob6) is required for NFR-10: a Workers AI failure must be
 * replayable from the recorded source image.
 */

export interface AnalyticsAttrs {
    jobId?: string;
    userId?: string;
    itemId?: string;
    durationMs?: number;
    status?: string;
    r2Key?: string;
    [k: string]: string | number | undefined;
}

interface AnalyticsEnv {
    ANALYTICS?: AnalyticsEngineDataset | undefined;
}

export function emit(env: AnalyticsEnv, event: string, attrs: AnalyticsAttrs = {}): void {
    const ds = env.ANALYTICS;
    if (!ds || typeof ds.writeDataPoint !== "function") {
        return;
    }

    try {
        ds.writeDataPoint({
            blobs: [
                event,
                attrs.jobId ?? null,
                attrs.userId ?? null,
                attrs.itemId ?? null,
                attrs.status ?? null,
                attrs.r2Key ?? null
            ],
            doubles: [attrs.durationMs ?? 0],
            indexes: [attrs.userId ?? "anon"]
        });
    } catch {
        // Best-effort. Never propagate analytics failures to the caller.
    }
}
