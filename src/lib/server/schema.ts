/**
 * D1 schema for Username Extractor.
 *
 * Mirrors the conceptual DDL in docs/web-port-prd.md §Data model and contracts.
 * Column names use snake_case at the SQL level for legibility in wrangler d1 execute.
 *
 * SQLite has no native datetime — all timestamps are Unix epoch ms in INTEGER columns.
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
    /** AES-GCM ciphertext + 12-byte IV prefix. Decrypted with env.NOTION_TOKEN_ENCRYPTION_KEY. */
    notionTokenEncrypted: blob("notion_token_encrypted"),
    notionDatabaseId: text("notion_database_id"),
    notionAutoSync: integer("notion_auto_sync").notNull().default(0),
    notionSkipValidation: integer("notion_skip_validation").notNull().default(0),
    notionValidationDelayMs: integer("notion_validation_delay_ms").notNull().default(2000),
    dailyImageQuota: integer("daily_image_quota").notNull().default(1000)
});

/** Job status: pending | running | completed | cancelled | failed */
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
        /** Set when the post-job NotionDeduplicator pass completes. JSON: { duplicate_groups, duplicates_found, duplicates_removed, errors }. */
        dedupSummary: text("dedup_summary"),
        createdAt: integer("created_at").notNull(),
        completedAt: integer("completed_at")
    },
    (table) => [
        index("idx_jobs_user_created").on(table.userId, table.createdAt),
        index("idx_jobs_status").on(table.status)
    ]
);

/** Item status: pending | running | verified | review | failed | duplicate */
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
        /** HIGH | MED | null */
        tier: text("tier"),
        isDuplicate: integer("is_duplicate").notNull().default(0),
        isNearDuplicate: integer("is_near_duplicate").notNull().default(0),
        similarTo: text("similar_to"),
        editDistance: integer("edit_distance"),
        /** Diagnostics-only: full raw model response text. */
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
 * Lifetime leads. Replaces the legacy cumulative `verified_usernames.md` regex scan
 * with an indexed (user_id, username) lookup.
 *
 * notion_status: 'added' | 'invalid' | 'pending' | 'unconfigured' | null
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
