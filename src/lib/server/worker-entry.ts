/**
 * Composite Worker entry. SvelteKit's adapter only emits `fetch`; this module
 * adds the additional handlers and class export the app needs:
 *
 *   queue          → image-jobs consumer        (`./queue/consumer`)
 *   scheduled      → nightly R2 sweep           (`./cron/sweep`)
 *   JobCoordinator → Durable Object class       (`./durable-objects/job-coordinator`)
 *
 * Build sequence (must stay in sync — see CLAUDE.md "Composite worker"):
 *   1. `vite build` → adapter-cloudflare writes `.svelte-kit/cloudflare/_worker.js`
 *   2. `scripts/wrap-worker.mjs` renames it to `_sveltekit-worker.js` and writes
 *      a new `_worker.js` that calls `createWorker(sveltekitDefault)`.
 *
 * Adding a new top-level Worker handler (e.g. `email`, `tail`) requires edits
 * to BOTH this file (return from `createWorker`) and `scripts/wrap-worker.mjs`.
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
 * Composes the SvelteKit `fetch` handler with this app's `queue`/`scheduled` handlers.
 * Caller (the generated `_worker.js`) injects `sveltekit` to break the build-time
 * cycle — the SvelteKit handler does not exist until after `vite build` runs.
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
