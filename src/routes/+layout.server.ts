import type { LayoutServerLoad } from "./$types";
import { getDb, schema } from "$lib/server/db";
import { eq } from "drizzle-orm";

/**
 * Loads `user_settings` for the current user. `userSettings === null` signals
 * the first-run wizard (rendered by `+layout.svelte`). DB errors and missing
 * bindings degrade silently to `null` — the wizard re-prompts.
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
