/// <reference types="@sveltejs/kit" />
/// <reference types="@cloudflare/workers-types" />

declare global {
    namespace App {
        interface Locals {
            /** Populated from Cloudflare Access JWT in hooks.server.ts. Null when Access is not yet wired (Phase 0). */
            userId: string | null;
            userEmail: string | null;
        }

        interface Platform {
            env: {
                DB: D1Database;
                R2: R2Bucket;
                KV: KVNamespace;
                AI: Ai;
                QUEUE: Queue;
                JOB_COORDINATOR: DurableObjectNamespace;
                ANALYTICS: AnalyticsEngineDataset;
                ASSETS: Fetcher;
                /** Workers Secret. AES-GCM key for encrypting Notion tokens at rest in D1. NFR-6. */
                NOTION_TOKEN_ENCRYPTION_KEY: string;
                /** Optional AI Gateway token for env.AI.run gateway option. */
                AI_GATEWAY_TOKEN: string;
            };
            cf: CfProperties;
            ctx: ExecutionContext;
        }

        interface PageData {
            userId: Locals["userId"];
            userEmail: Locals["userEmail"];
        }

        interface Error {
            message: string;
            errorId?: string;
        }
    }
}

export {};
