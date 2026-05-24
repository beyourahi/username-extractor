/**
 * Workers Analytics Engine emitter. No-op when the binding is absent.
 *
 * Schema:
 *   blobs:   [event, jobId, userId, itemId, status, r2Key]
 *   doubles: [durationMs]
 *   indexes: [userId]
 *
 * Keep blob/double indices stable — the dashboard SQL depends on positional
 * access (`blob1`, `blob2`, …). `r2Key` (blob6) backs NFR-10: Workers AI
 * failures are replayable from the source image at the recorded R2 key.
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
        // Analytics is best-effort — never let it break a request path.
    }
}
