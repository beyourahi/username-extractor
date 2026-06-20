/// <reference types="@sveltejs/kit" />
/// <reference types="@cloudflare/workers-types" />

import type { UserSettings } from "$lib/server/schema";
import type { Auth } from "$lib/server/auth";

declare global {
    namespace App {
        interface Locals {
            /** Derived by `hooks.server.ts` from the Better Auth session (`session.user.id/.email`).
             *  Preserved as the app-wide contract so protected routes read these, not the session. */
            userId: string | null;
            userEmail: string | null;
            user: Auth["$Infer"]["Session"]["user"] | null;
            session: Auth["$Infer"]["Session"]["session"] | null;
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
                /** Workers Secret. AES-GCM key for at-rest encryption of Notion + Cloudflare tokens in D1. NFR-6. */
                NOTION_TOKEN_ENCRYPTION_KEY: string;
                // Better Auth (Google OAuth). Secrets via `wrangler secret put`; BETTER_AUTH_URL is a var.
                BETTER_AUTH_SECRET: string;
                BETTER_AUTH_URL: string;
                GOOGLE_CLIENT_ID: string;
                GOOGLE_CLIENT_SECRET: string;
                /** `.dev.vars` only — local/preview auth bypass. Never set in production. */
                E2E_BYPASS_AUTH?: string;
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
