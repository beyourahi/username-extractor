DROP INDEX `uniq_leads_user_username`;--> statement-breakpoint
ALTER TABLE `leads` ADD `platform` text DEFAULT 'instagram' NOT NULL;--> statement-breakpoint
ALTER TABLE `leads` ADD `profile_url` text;--> statement-breakpoint
ALTER TABLE `leads` ADD `kind` text;--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_leads_user_username_platform` ON `leads` (`user_id`,`username`,`platform`);--> statement-breakpoint
ALTER TABLE `job_items` ADD `platform` text;--> statement-breakpoint
ALTER TABLE `job_items` ADD `kind` text;--> statement-breakpoint
UPDATE `leads` SET `profile_url` = `ig_url` WHERE `profile_url` IS NULL;