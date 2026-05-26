/**
 * Nightly R2 retention sweep. Wired via `scheduled` in worker-entry.ts;
 * trigger configured in wrangler.jsonc.
 *
 * Retention:
 *   `raw/`   → 30 days   (original upload bytes)
 *   `debug/` → 7 days    (diagnostics-mode raw VLM text)
 *
 * Lists each prefix paginated (limit 1000) and deletes one key at a time —
 * R2 has no batch delete, and serial deletes avoid concurrent-op spikes.
 * Any single delete or list failure is non-fatal; the run still emits a
 * `cron_sweep_completed` event with whatever counts it managed.
 */

import { emit } from "$lib/server/analytics";

interface SweepEnv {
    R2: R2Bucket;
    ANALYTICS?: AnalyticsEngineDataset;
}

const RAW_PREFIX = "raw/";
const DEBUG_PREFIX = "debug/";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const RAW_RETENTION_MS = 30 * MS_PER_DAY;
const DEBUG_RETENTION_MS = 7 * MS_PER_DAY;

async function sweepPrefix(
    env: SweepEnv,
    prefix: string,
    retentionMs: number,
    now: number
): Promise<{ scanned: number; deleted: number }> {
    let scanned = 0;
    let deleted = 0;
    let cursor: string | undefined;

    while (true) {
        const listArgs: R2ListOptions = { prefix, limit: 1000 };
        if (cursor) listArgs.cursor = cursor;
        const page = await env.R2.list(listArgs);
        const objects = page.objects ?? [];
        scanned += objects.length;

        const stale: string[] = [];
        for (const obj of objects) {
            const uploadedAt = obj.uploaded ? obj.uploaded.getTime() : 0;
            if (uploadedAt > 0 && now - uploadedAt > retentionMs) {
                stale.push(obj.key);
            }
        }

        for (const key of stale) {
            try {
                await env.R2.delete(key);
                deleted += 1;
            } catch {
                // Skip and continue — one stale key shouldn't poison the whole sweep.
            }
        }

        if (!page.truncated) break;
        cursor = "cursor" in page ? (page as { cursor?: string }).cursor : undefined;
        if (!cursor) break;
    }

    return { scanned, deleted };
}

export async function scheduledSweep(
    _controller: ScheduledController,
    env: SweepEnv,
    ctx: ExecutionContext
): Promise<void> {
    const now = Date.now();

    const job = (async () => {
        const rawStats = await sweepPrefix(env, RAW_PREFIX, RAW_RETENTION_MS, now).catch(() => ({
            scanned: 0,
            deleted: 0
        }));
        const debugStats = await sweepPrefix(env, DEBUG_PREFIX, DEBUG_RETENTION_MS, now).catch(() => ({
            scanned: 0,
            deleted: 0
        }));
        emit(env, "cron_sweep_completed", {
            durationMs: Date.now() - now,
            status: `raw=${rawStats.deleted}/${rawStats.scanned},debug=${debugStats.deleted}/${debugStats.scanned}`
        });
    })();

    ctx.waitUntil(job);
    await job;
}
