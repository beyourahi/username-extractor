import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

/**
 * Per-request D1 client factory. Workers binds D1 per-request, so we cannot
 * cache the client at module scope — call this inside every load function
 * and +server.ts handler. See PRD execution plan §Cross-cutting concerns.
 */
export function getDb(platform: App.Platform | undefined) {
    if (!platform?.env?.DB) {
        throw new Error("D1 binding 'DB' is not available on platform.env. Ensure wrangler.jsonc declares the binding and you are running via `wrangler dev` or a deployed Worker.");
    }
    return drizzle(platform.env.DB, { schema });
}

export type Db = ReturnType<typeof getDb>;
export { schema };
