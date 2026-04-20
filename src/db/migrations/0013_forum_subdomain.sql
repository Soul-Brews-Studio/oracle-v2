-- Migration 0013: Forum row → forum.buildwithoracle.com subdomain
-- Existing /forum row (seeded via /api/threads route) becomes path='/', studio='forum.*'
-- Clear parent_id so frontend fallback's Memory ▾ structure owns the hierarchy.

UPDATE menu_items
   SET path = '/',
       studio = 'forum.buildwithoracle.com',
       parent_id = NULL,
       updated_at = unixepoch()
 WHERE path = '/forum';
