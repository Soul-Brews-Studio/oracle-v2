ALTER TABLE `oracle_documents` ADD `expires_at` integer;--> statement-breakpoint
ALTER TABLE `oracle_documents` ADD `ttl_days` integer;--> statement-breakpoint
CREATE INDEX `idx_expires` ON `oracle_documents` (`expires_at`);