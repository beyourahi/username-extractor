/**
 * Drizzle schema for the D1 database. Mirrors docs/web-port-prd.md §Data model.
 *
 * Conventions:
 *  - SQL columns are snake_case (readable via `wrangler d1 execute`); TS fields are camelCase.
 *  - Timestamps are Unix epoch ms in INTEGER (SQLite has no native datetime).
 *  - Booleans are INTEGER 0/1.
 *  - All `user_id` columns FK to `users.id`. `job_items` cascades on job delete.
 *
 * Migrations live in `migrations/` and are generated via `bun run db:generate`.
 * NEVER hand-edit a generated migration after it has been applied to production.
 */
import { sqliteTable, text, integer, real, blob, index, uniqueIndex } from "drizzle-orm/sqlite-core";

// ── Better Auth tables (Google OAuth). snake_case + plural — REQUIRED by the Drizzle
// adapter with `usePlural: true` (src/lib/server/auth.ts). Renaming breaks auth silently.
// `users.id` is the FK target for jobs/leads/user_settings — its shape is preserved.
export const users = sqliteTable("users", {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
    name: text("name"),
    image: text("image"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull()
});

export const sessions = sqliteTable(
    "sessions",
    {
        id: text("id").primaryKey(),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        token: text("token").notNull().unique(),
        expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
        ipAddress: text("ip_address"),
        userAgent: text("user_agent"),
        createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
        updatedAt: integer("updated_at", { mode: "timestamp" }).notNull()
    },
    (table) => [index("idx_sessions_user_id").on(table.userId)]
);

export const accounts = sqliteTable(
    "accounts",
    {
        id: text("id").primaryKey(),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        accountId: text("account_id").notNull(),
        providerId: text("provider_id").notNull(),
        accessToken: text("access_token"),
        refreshToken: text("refresh_token"),
        accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }),
        refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }),
        scope: text("scope"),
        idToken: text("id_token"),
        password: text("password"),
        createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
        updatedAt: integer("updated_at", { mode: "timestamp" }).notNull()
    },
    (table) => [
        index("idx_accounts_user_id").on(table.userId),
        uniqueIndex("idx_accounts_provider").on(table.providerId, table.accountId)
    ]
);

export const verifications = sqliteTable(
    "verifications",
    {
        id: text("id").primaryKey(),
        identifier: text("identifier").notNull(),
        value: text("value").notNull(),
        expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
        createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
        updatedAt: integer("updated_at", { mode: "timestamp" }).notNull()
    },
    (table) => [index("idx_verifications_identifier").on(table.identifier)]
);

// Better Auth's D1-backed rate limiter (auth.ts `rateLimit.storage: "database"`).
export const rateLimits = sqliteTable(
    "rate_limits",
    {
        id: text("id").primaryKey(),
        key: text("key").notNull(),
        count: integer("count").notNull(),
        lastRequest: integer("last_request").notNull()
    },
    (table) => [index("idx_rate_limits_key").on(table.key)]
);

export const userSettings = sqliteTable("user_settings", {
    userId: text("user_id")
        .primaryKey()
        .references(() => users.id, { onDelete: "cascade" }),
    diagnosticsDefault: integer("diagnostics_default").notNull().default(0),
    /** Layout: [12-byte IV] || [AES-GCM ciphertext]. Encrypt/decrypt via `src/lib/server/crypto.ts` using env.NOTION_TOKEN_ENCRYPTION_KEY. NFR-6. */
    notionTokenEncrypted: blob("notion_token_encrypted"),
    notionDatabaseId: text("notion_database_id"),
    notionAutoSync: integer("notion_auto_sync").notNull().default(0),
    notionSkipValidation: integer("notion_skip_validation").notNull().default(0),
    notionValidationDelayMs: integer("notion_validation_delay_ms").notNull().default(2000),
    dailyImageQuota: integer("daily_image_quota").notNull().default(0),
    /** Notion post-job dedup winner strategy: 'best' | 'oldest' | 'newest'. See `src/lib/notion/dedup.ts#KeepStrategy`. */
    dedupKeepStrategy: text("dedup_keep_strategy").notNull().default("best"),
    /**
     * The user's own Cloudflare API token (AES-GCM encrypted, same layout/key as the Notion token:
     * [12-byte IV] || ciphertext, via crypto.ts + env.NOTION_TOKEN_ENCRYPTION_KEY). Inference runs on
     * the user's account billed to them — the owner's bound `env.AI` is no longer used per-item.
     */
    cloudflareTokenEncrypted: blob("cloudflare_token_encrypted"),
    /** The user's Cloudflare account id (not secret) — REST target `/accounts/{id}/ai/run/{model}`. */
    cloudflareAccountId: text("cloudflare_account_id"),
    /** Selected Workers AI vision model id, e.g. "@cf/moonshotai/kimi-k2.6". Null → DEFAULT_MODEL. */
    cloudflareModel: text("cloudflare_model")
});

/** `status`: pending | running | completed | cancelled | failed. Mirror in `$lib/types/messages` JobStatus. */
export const jobs = sqliteTable(
    "jobs",
    {
        id: text("id").primaryKey(),
        userId: text("user_id")
            .notNull()
            .references(() => users.id),
        status: text("status").notNull(),
        vlmModel: text("vlm_model").notNull(),
        diagnostics: integer("diagnostics").notNull(),
        imageCount: integer("image_count").notNull(),
        /**
         * 1 once the client has finished uploading every chunk of a job; 0 while a
         * chunked folder upload is still streaming items in. `maybeFinalizeJob`
         * refuses to complete a job until this is 1, so an early chunk draining
         * before later chunks arrive can't prematurely mark the job done.
         * Defaults to 1 — the legacy single-POST path is complete on creation.
         */
        uploadComplete: integer("upload_complete").notNull().default(1),
        /** JSON written by the post-job NotionDeduplicator (`src/lib/notion/dedup.ts`). Shape: `{ duplicate_groups, duplicates_found, duplicates_removed, errors }`. */
        dedupSummary: text("dedup_summary"),
        createdAt: integer("created_at").notNull(),
        completedAt: integer("completed_at")
    },
    (table) => [
        index("idx_jobs_user_created").on(table.userId, table.createdAt),
        index("idx_jobs_status").on(table.status)
    ]
);

/** `status`: pending | running | verified | review | failed | duplicate. Mirror in `$lib/types/messages` ItemStatus. */
export const jobItems = sqliteTable(
    "job_items",
    {
        id: text("id").primaryKey(),
        jobId: text("job_id")
            .notNull()
            .references(() => jobs.id, { onDelete: "cascade" }),
        filename: text("filename").notNull(),
        r2Key: text("r2_key").notNull(),
        status: text("status").notNull(),
        username: text("username"),
        confidence: real("confidence"),
        /** "HIGH" | "MED" | null. See `src/lib/extract/classify.ts` for tier rules. */
        tier: text("tier"),
        isDuplicate: integer("is_duplicate").notNull().default(0),
        isNearDuplicate: integer("is_near_duplicate").notNull().default(0),
        similarTo: text("similar_to"),
        editDistance: integer("edit_distance"),
        /** Populated only when `jobs.diagnostics = 1`. Raw VLM response text for replay/debugging. */
        rawModelResponse: text("raw_model_response"),
        error: text("error"),
        createdAt: integer("created_at").notNull(),
        completedAt: integer("completed_at")
    },
    (table) => [
        index("idx_job_items_job_id").on(table.jobId),
        index("idx_job_items_job_status").on(table.jobId, table.status)
    ]
);

/**
 * Lifetime leads table — the canonical "have I seen this username before?" store.
 * Replaces the legacy `verified_usernames.md` regex scan with an indexed
 * `(user_id, username)` unique lookup.
 *
 * `notion_status`: 'added' | 'invalid' | 'pending' | 'unconfigured' | null.
 * `archived = 1` excludes a row from active dedup checks but preserves history.
 */
export const leads = sqliteTable(
    "leads",
    {
        id: text("id").primaryKey(),
        userId: text("user_id")
            .notNull()
            .references(() => users.id),
        username: text("username").notNull(),
        igUrl: text("ig_url").notNull(),
        tier: text("tier").notNull(),
        confidence: real("confidence").notNull(),
        sourceJobId: text("source_job_id").references(() => jobs.id),
        notionPageId: text("notion_page_id"),
        notionStatus: text("notion_status"),
        notionLastError: text("notion_last_error"),
        archived: integer("archived").notNull().default(0),
        createdAt: integer("created_at").notNull()
    },
    (table) => [
        uniqueIndex("uniq_leads_user_username").on(table.userId, table.username),
        index("idx_leads_user_username").on(table.userId, table.username),
        index("idx_leads_notion_status").on(table.userId, table.notionStatus),
        index("idx_leads_user_created").on(table.userId, table.createdAt)
    ]
);

export type User = typeof users.$inferSelect;
export type UserSettings = typeof userSettings.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type JobItem = typeof jobItems.$inferSelect;
export type Lead = typeof leads.$inferSelect;
