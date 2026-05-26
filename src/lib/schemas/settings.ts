import { z } from "zod";

/**
 * Settings form schema. 1:1 with `user_settings` in `src/lib/server/schema.ts`.
 *
 * CONTRACT: `notionToken === ""` means "preserve the existing ciphertext".
 * The server MUST NOT clear `user_settings.notion_token_encrypted` on empty input.
 * Use a dedicated "remove token" action if/when that capability is exposed.
 */
export const settingsSchema = z.object({
    diagnosticsDefault: z.boolean().default(false),
    notionToken: z.string().optional().default(""),
    notionDatabaseId: z.string().optional().default(""),
    notionAutoSync: z.boolean().default(false),
    notionSkipValidation: z.boolean().default(false),
    notionValidationDelayMs: z.number().int().min(0).max(60000).default(2000),
    dailyImageQuota: z.number().int().min(0).max(10000).default(1000)
});

export type SettingsForm = z.infer<typeof settingsSchema>;

export const dedupActionSchema = z.object({
    dryRun: z.boolean().default(true)
});
