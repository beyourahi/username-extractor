import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

/**
 * Per-request D1 client factory. The D1 binding is request-scoped on Workers —
 * NEVER cache the returned client at module scope or across requests. Call
 * inside each `load`, `+server.ts` handler, queue consumer, etc.
 *
 * Throws synchronously when the DB binding is missing (misconfigured
 * wrangler.jsonc or running outside a Workers context).
 */
export function getDb(platform: App.Platform | undefined) {
    if (!platform?.env?.DB) {
        throw new Error(
            "D1 binding 'DB' is not available on platform.env. Ensure wrangler.jsonc declares the binding and you are running via `wrangler dev` or a deployed Worker."
        );
    }
    return drizzle(platform.env.DB, { schema });
}

export type Db = ReturnType<typeof getDb>;
export { schema };
