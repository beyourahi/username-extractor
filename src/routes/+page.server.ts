import type { PageServerLoad } from "./$types";

/** Narrows `userSettings` (from `+layout.server.ts`) to the flags the upload form needs.
 *  `cloudflareConnected` gates job creation — inference runs on the user's own account. */
export const load: PageServerLoad = async ({ parent }) => {
    const layout = await parent();
    return {
        diagnosticsDefault: Boolean(layout.userSettings?.diagnosticsDefault),
        notionConfigured: Boolean(layout.userSettings?.notionDatabaseId),
        cloudflareConnected: Boolean(
            layout.userSettings?.cloudflareAccountId && layout.userSettings?.cloudflareTokenEncrypted
        ),
        cloudflareModel: layout.userSettings?.cloudflareModel ?? "@cf/moonshotai/kimi-k2.6"
    };
};
