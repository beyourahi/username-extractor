import { z } from "zod";

/**
 * Settings form schema. Mirrors `user_settings` columns in
 * `src/lib/server/schema.ts`. The token is optional on write — empty string
 * means "leave existing encrypted token in place" so users don't have to retype
 * it on every save.
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
