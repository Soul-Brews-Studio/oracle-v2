-- #958 submenu reorg: parentId-driven Tools + Canvas parents,
-- reparent children, demote duplicate Feed/Schedule main rows.

INSERT OR IGNORE INTO menu_items
  (path, label, group_key, parent_id, position, enabled, access, source, touched_at, created_at, updated_at)
VALUES
  ('#tools',  'Tools',  'main', NULL, 40, 1, 'public', 'custom', unixepoch(), unixepoch(), unixepoch()),
  ('#canvas', 'Canvas', 'main', NULL, 50, 1, 'public', 'custom', unixepoch(), unixepoch(), unixepoch());
--> statement-breakpoint
UPDATE menu_items
SET parent_id = (SELECT id FROM menu_items WHERE path = '#tools'),
    group_key = 'main',
    touched_at = unixepoch(),
    updated_at = unixepoch()
WHERE path IN ('/playground', '/forum', '/plugins', '/evolution', '/pulse')
  AND parent_id IS NULL;
--> statement-breakpoint
UPDATE menu_items
SET parent_id = (SELECT id FROM menu_items WHERE path = '#canvas'),
    group_key = 'main',
    query = COALESCE(query, '{"plugin":"map"}'),
    touched_at = unixepoch(),
    updated_at = unixepoch()
WHERE path = '/map' AND parent_id IS NULL;
--> statement-breakpoint
INSERT OR IGNORE INTO menu_items
  (path, label, group_key, parent_id, position, enabled, access, source, query, touched_at, created_at, updated_at)
VALUES
  ('/planets', 'Planets', 'main',
   (SELECT id FROM menu_items WHERE path = '#canvas'),
   20, 1, 'public', 'custom', '{"plugin":"planets"}',
   unixepoch(), unixepoch(), unixepoch());
--> statement-breakpoint
UPDATE menu_items
SET group_key = 'hidden',
    touched_at = unixepoch(),
    updated_at = unixepoch()
WHERE path IN ('/feed', '/schedule') AND group_key = 'main';
