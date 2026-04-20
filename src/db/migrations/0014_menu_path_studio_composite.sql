-- Migration 0014: menu_items unique key on (path, studio) composite.
-- After migration 0013 extracted Forum to studio='forum.buildwithoracle.com',
-- further subdomain extracts (Feed, Canvas, Schedule) will also map to path='/'.
-- The old UNIQUE(path) index would reject those rows; replace with composite.
-- COALESCE(studio, '') so NULL studios collide with each other — preserves the
-- "duplicate path" guarantee for legacy/route-seeded rows where studio is null.

DROP INDEX IF EXISTS `menu_items_path_unique`;
--> statement-breakpoint
DROP INDEX IF EXISTS `menu_items_path_studio_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX `menu_items_path_studio_unique` ON `menu_items` (`path`, COALESCE(`studio`, ''));
