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

export const users = sqliteTable("users", {
    id: text("id").primaryKey(),
    cfAccessSubject: text("cf_access_subject").notNull().unique(),
    createdAt: integer("created_at").notNull()
});

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
    dailyImageQuota: integer("daily_image_quota").notNull().default(1000),
    /** Notion post-job dedup winner strategy: 'best' | 'oldest' | 'newest'. See `src/lib/notion/dedup.ts#KeepStrategy`. */
    dedupKeepStrategy: text("dedup_keep_strategy").notNull().default("best")
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
