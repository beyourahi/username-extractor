import { z } from "zod";

/**
 * Settings form schema. 1:1 with `user_settings` in `src/lib/server/schema.ts`.
 *
 * CONTRACT: `notionToken === ""` (and likewise `cloudflareToken === ""`) means
 * "preserve the existing ciphertext". The server MUST NOT clear the stored token
 * blob on empty input. Use a dedicated "remove token" action if/when exposed.
 */
export const settingsSchema = z.object({
    diagnosticsDefault: z.boolean().default(false),
    notionToken: z.string().optional().default(""),
    notionDatabaseId: z.string().optional().default(""),
    notionAutoSync: z.boolean().default(false),
    notionSkipValidation: z.boolean().default(false),
    notionValidationDelayMs: z.number().int().min(0).max(60000).default(2000),
    /** 0 = unlimited (default). A user may set a positive cap as a self-serve kill-switch. */
    dailyImageQuota: z.number().int().min(0).max(1000000).default(0),
    /** Notion post-job dedup winner: keep the best-scored handle, or the oldest/newest page. */
    dedupKeepStrategy: z.enum(["best", "oldest", "newest"]).default("best"),
    /** The user's own Cloudflare API token (Account → Workers AI → Read). "" preserves existing. */
    cloudflareToken: z.string().optional().default(""),
    cloudflareAccountId: z.string().trim().optional().default(""),
    /** Selected Workers AI vision model id. */
    cloudflareModel: z.string().optional().default("@cf/moonshotai/kimi-k2.6")
});

export type SettingsForm = z.infer<typeof settingsSchema>;

export const dedupActionSchema = z.object({
    dryRun: z.boolean().default(true)
});
