CREATE TABLE `activity_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`timestamp` text NOT NULL,
	`type` text NOT NULL,
	`path` text,
	`size_bytes` integer,
	`project` text,
	`metadata` text,
	`created_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_activity_date` ON `activity_log` (`date`);--> statement-breakpoint
CREATE INDEX `idx_activity_type` ON `activity_log` (`type`);--> statement-breakpoint
CREATE INDEX `idx_activity_project` ON `activity_log` (`project`);--> statement-breakpoint
CREATE TABLE `supersede_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`old_path` text NOT NULL,
	`old_id` text,
	`old_title` text,
	`old_type` text,
	`new_path` text,
	`new_id` text,
	`new_title` text,
	`reason` text,
	`superseded_at` integer NOT NULL,
	`superseded_by` text,
	`project` text
);
--> statement-breakpoint
CREATE INDEX `idx_supersede_old_path` ON `supersede_log` (`old_path`);--> statement-breakpoint
CREATE INDEX `idx_supersede_new_path` ON `supersede_log` (`new_path`);--> statement-breakpoint
CREATE INDEX `idx_supersede_created` ON `supersede_log` (`superseded_at`);--> statement-breakpoint
CREATE INDEX `idx_supersede_project` ON `supersede_log` (`project`);--> statement-breakpoint
ALTER TABLE `indexing_status` ADD `repo_root` text;--> statement-breakpoint
ALTER TABLE `trace_log` ADD `prev_trace_id` text;--> statement-breakpoint
ALTER TABLE `trace_log` ADD `next_trace_id` text;--> statement-breakpoint
CREATE INDEX `idx_trace_prev` ON `trace_log` (`prev_trace_id`);--> statement-breakpoint
CREATE INDEX `idx_trace_next` ON `trace_log` (`next_trace_id`);