ALTER TABLE `jobs` ADD `upload_complete` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `dedup_keep_strategy` text DEFAULT 'best' NOT NULL;