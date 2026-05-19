/**
 * Custom Worker entry. Wraps the SvelteKit-generated worker to add the
 * pipeline handlers:
 *
 * - `queue`     — image-jobs consumer
 * - `scheduled` — nightly R2 sweep
 * - `JobCoordinator` — Durable Object class export
 *
 * The build pipeline:
 *   1. `vite build` runs `@sveltejs/adapter-cloudflare` which writes
 *      `.svelte-kit/cloudflare/_worker.js`.
 *   2. `scripts/wrap-worker.mjs` renames that file to
 *      `.svelte-kit/cloudflare/_sveltekit-worker.js` and replaces
 *      `_worker.js` with a thin wrapper that imports this module.
 *
 * The wrapper file (post-build) re-exports `default` from here.
 */

import { queueConsumer } from "./queue/consumer";
import { scheduledSweep } from "./cron/sweep";
import type { QueueMessage } from "$lib/types/messages";

export { JobCoordinator } from "./durable-objects/job-coordinator";

interface WrapperEnv {
    DB: D1Database;
    R2: R2Bucket;
    KV: KVNamespace;
    AI: Ai;
    QUEUE: Queue<QueueMessage>;
    JOB_COORDINATOR: DurableObjectNamespace;
    ANALYTICS?: AnalyticsEngineDataset;
    NOTION_TOKEN_ENCRYPTION_KEY: string;
    AI_GATEWAY_SLUG?: string;
    AI_GATEWAY_TOKEN?: string;
}

interface SvelteKitHandler {
    fetch: (request: Request, env: WrapperEnv, ctx: ExecutionContext) => Promise<Response>;
}

/**
 * Builds a composite worker. The SvelteKit handler is loaded lazily at
 * runtime via a relative import that resolves only after the build wrapper
 * has moved the generated file into place.
 */
export function createWorker(sveltekit: SvelteKitHandler) {
    return {
        async fetch(request: Request, env: WrapperEnv, ctx: ExecutionContext): Promise<Response> {
            return sveltekit.fetch(request, env, ctx);
        },
        async queue(batch: MessageBatch<QueueMessage>, env: WrapperEnv, ctx: ExecutionContext): Promise<void> {
            await queueConsumer(batch, env, ctx);
        },
        async scheduled(controller: ScheduledController, env: WrapperEnv, ctx: ExecutionContext): Promise<void> {
            await scheduledSweep(controller, env, ctx);
        }
    };
}
