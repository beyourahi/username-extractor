import type { PageServerLoad } from "./$types";

/**
 * Upload landing page. Surfaces the diagnostics default from user settings so
 * the dropzone toggle can preselect it. Settings themselves are loaded by
 * `+layout.server.ts`; we just narrow the slice we care about here.
 */
export const load: PageServerLoad = async ({ parent }) => {
    const layout = await parent();
    return {
        diagnosticsDefault: Boolean(layout.userSettings?.diagnosticsDefault),
        notionConfigured: Boolean(layout.userSettings?.notionDatabaseId)
    };
};
