CREATE TABLE `menu_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`path` text NOT NULL,
	`label` text NOT NULL,
	`group_key` text NOT NULL,
	`parent_id` integer,
	`position` integer DEFAULT 999 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`access` text DEFAULT 'public' NOT NULL,
	`source` text NOT NULL,
	`icon` text,
	`touched_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `menu_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `menu_items_path_unique` ON `menu_items` (`path`);--> statement-breakpoint
CREATE INDEX `idx_menu_parent` ON `menu_items` (`parent_id`,`position`);--> statement-breakpoint
CREATE INDEX `idx_menu_group` ON `menu_items` (`group_key`,`position`);