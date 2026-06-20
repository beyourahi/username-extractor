import type { PageServerLoad } from "./$types";

/** Narrows `userSettings` (from `+layout.server.ts`) to the flags the upload form needs.
 *  `signedIn` distinguishes a logged-out guest (browsing the optional-auth homepage) from a
 *  signed-in user who simply hasn't connected Cloudflare yet. `cloudflareConnected` gates job
 *  creation — inference runs on the user's own account. */
export const load: PageServerLoad = async ({ parent }) => {
    const layout = await parent();
    return {
        signedIn: Boolean(layout.userId),
        diagnosticsDefault: Boolean(layout.userSettings?.diagnosticsDefault),
        notionConfigured: Boolean(layout.userSettings?.notionDatabaseId),
        cloudflareConnected: Boolean(
            layout.userSettings?.cloudflareAccountId && layout.userSettings?.cloudflareTokenEncrypted
        ),
        cloudflareModel: layout.userSettings?.cloudflareModel ?? "@cf/moonshotai/kimi-k2.6"
    };
};
