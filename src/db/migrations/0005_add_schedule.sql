CREATE TABLE IF NOT EXISTS `schedule` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`date_raw` text,
	`time` text,
	`event` text NOT NULL,
	`notes` text,
	`recurring` text,
	`status` text DEFAULT 'pending',
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_schedule_date` ON `schedule` (`date`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_schedule_status` ON `schedule` (`status`);
