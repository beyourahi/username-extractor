/**
 * Nightly R2 sweeper.
 *
 *   raw/   → delete after 30 days
 *   debug/ → delete after 7 days
 *
 * Paginated R2 list; both prefixes processed in series. Failures are
 * non-fatal — we emit to analytics and continue.
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

        // R2 has no batch delete; the binding deletes per-key but we run them
        // serially to avoid spiking concurrent ops.
        for (const key of stale) {
            try {
                await env.R2.delete(key);
                deleted += 1;
            } catch {
                // Continue on individual failures.
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
