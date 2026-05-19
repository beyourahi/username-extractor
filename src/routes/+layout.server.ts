import type { LayoutServerLoad } from "./$types";
import { getDb, schema } from "$lib/server/db";
import { eq } from "drizzle-orm";

/**
 * Loads the active user's settings row (if any). The presence/absence drives
 * the first-run wizard mounted in `+layout.svelte`.
 *
 * Workers-runtime safe: only uses `platform.env.DB` via the per-request
 * Drizzle client.
 */
export const load: LayoutServerLoad = async ({ locals, platform }) => {
    if (!locals.userId || !platform?.env?.DB) {
        return { userId: locals.userId, userEmail: locals.userEmail, userSettings: null };
    }
    try {
        const db = getDb(platform);
        const rows = await db
            .select()
            .from(schema.userSettings)
            .where(eq(schema.userSettings.userId, locals.userId))
            .limit(1);
        return {
            userId: locals.userId,
            userEmail: locals.userEmail,
            userSettings: rows[0] ?? null
        };
    } catch {
        return { userId: locals.userId, userEmail: locals.userEmail, userSettings: null };
    }
};
