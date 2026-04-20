ALTER TABLE `menu_items` ADD COLUMN `studio` text;
--> statement-breakpoint
UPDATE menu_items SET studio = 'studio.buildwithoracle.com', updated_at = unixepoch() WHERE path = '/search' AND studio IS NULL;
--> statement-breakpoint
UPDATE menu_items SET studio = 'feed.buildwithoracle.com', updated_at = unixepoch() WHERE path = '/feed' AND studio IS NULL;
--> statement-breakpoint
UPDATE menu_items SET studio = 'schedule.buildwithoracle.com', updated_at = unixepoch() WHERE path = '/schedule' AND studio IS NULL;
--> statement-breakpoint
UPDATE menu_items SET studio = 'canvas.buildwithoracle.com', updated_at = unixepoch() WHERE path IN ('/map', '/planets', '#canvas') AND studio IS NULL;
