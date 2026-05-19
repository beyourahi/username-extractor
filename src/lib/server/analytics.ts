/**
 * Workers Analytics Engine emitter. No-op when the binding is absent.
 *
 * Schema:
 *   blobs:   [event, jobId, userId, itemId, status]
 *   doubles: [durationMs]
 *   indexes: [userId]
 *
 * Keep blob/double indices stable — the dashboard SQL depends on positional
 * access (`blob1`, `blob2`, …).
 */

export interface AnalyticsAttrs {
    jobId?: string;
    userId?: string;
    itemId?: string;
    durationMs?: number;
    status?: string;
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
            blobs: [event, attrs.jobId ?? null, attrs.userId ?? null, attrs.itemId ?? null, attrs.status ?? null],
            doubles: [attrs.durationMs ?? 0],
            indexes: [attrs.userId ?? "anon"]
        });
    } catch {
        // Analytics is best-effort — never let it break a request path.
    }
}
