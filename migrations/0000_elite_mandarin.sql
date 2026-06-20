CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`id_token` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_accounts_user_id` ON `accounts` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_accounts_provider` ON `accounts` (`provider_id`,`account_id`);--> statement-breakpoint
CREATE TABLE `job_items` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`filename` text NOT NULL,
	`r2_key` text NOT NULL,
	`status` text NOT NULL,
	`username` text,
	`confidence` real,
	`tier` text,
	`is_duplicate` integer DEFAULT 0 NOT NULL,
	`is_near_duplicate` integer DEFAULT 0 NOT NULL,
	`similar_to` text,
	`edit_distance` integer,
	`raw_model_response` text,
	`error` text,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_job_items_job_id` ON `job_items` (`job_id`);--> statement-breakpoint
CREATE INDEX `idx_job_items_job_status` ON `job_items` (`job_id`,`status`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`vlm_model` text NOT NULL,
	`diagnostics` integer NOT NULL,
	`image_count` integer NOT NULL,
	`upload_complete` integer DEFAULT 1 NOT NULL,
	`dedup_summary` text,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_jobs_user_created` ON `jobs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_jobs_status` ON `jobs` (`status`);--> statement-breakpoint
CREATE TABLE `leads` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`username` text NOT NULL,
	`ig_url` text NOT NULL,
	`tier` text NOT NULL,
	`confidence` real NOT NULL,
	`source_job_id` text,
	`notion_page_id` text,
	`notion_status` text,
	`notion_last_error` text,
	`archived` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_leads_user_username` ON `leads` (`user_id`,`username`);--> statement-breakpoint
CREATE INDEX `idx_leads_user_username` ON `leads` (`user_id`,`username`);--> statement-breakpoint
CREATE INDEX `idx_leads_notion_status` ON `leads` (`user_id`,`notion_status`);--> statement-breakpoint
CREATE INDEX `idx_leads_user_created` ON `leads` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`count` integer NOT NULL,
	`last_request` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_rate_limits_key` ON `rate_limits` (`key`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_unique` ON `sessions` (`token`);--> statement-breakpoint
CREATE INDEX `idx_sessions_user_id` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `user_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`diagnostics_default` integer DEFAULT 0 NOT NULL,
	`notion_token_encrypted` blob,
	`notion_database_id` text,
	`notion_auto_sync` integer DEFAULT 0 NOT NULL,
	`notion_skip_validation` integer DEFAULT 0 NOT NULL,
	`notion_validation_delay_ms` integer DEFAULT 2000 NOT NULL,
	`daily_image_quota` integer DEFAULT 0 NOT NULL,
	`dedup_keep_strategy` text DEFAULT 'best' NOT NULL,
	`cloudflare_token_encrypted` blob,
	`cloudflare_account_id` text,
	`cloudflare_model` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`name` text,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_verifications_identifier` ON `verifications` (`identifier`);