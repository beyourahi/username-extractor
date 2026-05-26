import type { PageServerLoad } from "./$types";

/** Narrows `userSettings` (from `+layout.server.ts`) to the two flags the upload form needs. */
export const load: PageServerLoad = async ({ parent }) => {
    const layout = await parent();
    return {
        diagnosticsDefault: Boolean(layout.userSettings?.diagnosticsDefault),
        notionConfigured: Boolean(layout.userSettings?.notionDatabaseId)
    };
};
