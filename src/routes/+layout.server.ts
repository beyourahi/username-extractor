import type { LayoutServerLoad } from "./$types";
import { getDb, schema } from "$lib/server/db";
import { eq } from "drizzle-orm";

/**
 * Loads `user_settings` for the current user. `userSettings === null` signals
 * the first-run wizard (rendered by `+layout.svelte`). DB errors and missing
 * bindings degrade silently to `null` — the wizard re-prompts.
 */
export const load: LayoutServerLoad = async ({ locals, platform }) => {
    // Presentation-only projection of the already-resolved session user (name/email/image)
    // for the AppBar's profile widget. No new auth/DB work — just surfaces what `locals.user`
    // already holds so the navbar can show the user's picture (or the silhouette fallback).
    const user = locals.user
        ? { name: locals.user.name, email: locals.user.email, image: locals.user.image ?? null }
        : null;

    if (!locals.userId || !platform?.env?.DB) {
        return { userId: locals.userId, userEmail: locals.userEmail, user, userSettings: null };
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
            user,
            userSettings: rows[0] ?? null
        };
    } catch {
        return { userId: locals.userId, userEmail: locals.userEmail, user, userSettings: null };
    }
};
