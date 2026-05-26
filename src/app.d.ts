/// <reference types="@sveltejs/kit" />
/// <reference types="@cloudflare/workers-types" />

import type { UserSettings } from "$lib/server/schema";

declare global {
    namespace App {
        interface Locals {
            /** Set by `hooks.server.ts` from the Cloudflare Access JWT. Null until Access is wired (Phase 0). */
            userId: string | null;
            userEmail: string | null;
            userSettings?: UserSettings | null;
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
                /** Workers Secret. AES-GCM key for at-rest encryption of Notion tokens in D1 (`user_settings.notion_token_encrypted`). NFR-6. */
                NOTION_TOKEN_ENCRYPTION_KEY: string;
                /** Optional. When set, `env.AI.run` is invoked with the `gateway` option (see `src/lib/server/ai/gateway.ts`). */
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
