/**
 * Migration 0013: Forum row → forum.buildwithoracle.com subdomain.
 *
 * Verifies the raw SQL transformation moves an existing `/forum` row to
 * path='/', studio='forum.buildwithoracle.com', parent_id=NULL.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { eq, or } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db, menuItems, sqlite } from '../../../db/index.ts';
import { readApiMenuItemsFromDb } from '../menu.ts';

const MIGRATION_SQL = readFileSync(
  join(import.meta.dir, '..', '..', '..', 'db', 'migrations', '0013_forum_subdomain.sql'),
  'utf8',
);

function applyMigration(): void {
  for (const stmt of MIGRATION_SQL.split('--> statement-breakpoint')) {
    const trimmed = stmt.trim();
    if (!trimmed || trimmed.replace(/--.*$/gm, '').trim() === '') continue;
    sqlite.exec(trimmed);
  }
}

function cleanupForumRows(): void {
  db
    .delete(menuItems)
    .where(
      or(
        eq(menuItems.path, '/forum'),
        eq(menuItems.path, '/'),
        eq(menuItems.label, '__forum_subdomain_test__'),
        eq(menuItems.label, '__forum_parent_test__'),
      ),
    )
    .run();
}

describe('migration 0013 — forum subdomain', () => {
  beforeEach(() => {
    cleanupForumRows();
  });

  afterEach(() => {
    cleanupForumRows();
  });

  it('converts /forum row to path=/ with studio=forum.buildwithoracle.com', () => {
    const now = new Date();
    const parent = db
      .insert(menuItems)
      .values({
        path: `/__forum_parent_${Date.now()}`,
        label: '__forum_parent_test__',
        groupKey: 'main',
        position: 40,
        enabled: true,
        access: 'public',
        source: 'custom',
        touchedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    const inserted = db
      .insert(menuItems)
      .values({
        path: '/forum',
        label: '__forum_subdomain_test__',
        groupKey: 'main',
        position: 42,
        enabled: true,
        access: 'public',
        source: 'route',
        studio: null,
        parentId: parent.id,
        touchedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    applyMigration();

    const row = db.select().from(menuItems).where(eq(menuItems.id, inserted.id)).get();
    expect(row).toBeDefined();
    expect(row!.path).toBe('/');
    expect(row!.studio).toBe('forum.buildwithoracle.com');
    expect(row!.parentId).toBeNull();
  });

  it('leaves non-forum rows untouched', () => {
    const now = new Date();
    const untouchedPath = `/__untouched_${Date.now()}`;
    try {
      db
        .insert(menuItems)
        .values({
          path: untouchedPath,
          label: 'Untouched',
          groupKey: 'main',
          position: 500,
          enabled: true,
          access: 'public',
          source: 'custom',
          studio: 'studio.buildwithoracle.com',
          touchedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      applyMigration();

      const row = db.select().from(menuItems).where(eq(menuItems.path, untouchedPath)).get();
      expect(row?.studio).toBe('studio.buildwithoracle.com');
      expect(row?.path).toBe(untouchedPath);
    } finally {
      db.delete(menuItems).where(eq(menuItems.path, untouchedPath)).run();
    }
  });

  it('no row with path=/forum remains after /api/menu read', () => {
    const now = new Date();
    db
      .insert(menuItems)
      .values({
        path: '/forum',
        label: '__forum_subdomain_test__',
        groupKey: 'main',
        position: 42,
        enabled: true,
        access: 'public',
        source: 'route',
        touchedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    applyMigration();

    const items = readApiMenuItemsFromDb();
    expect(items.some((i) => i.path === '/forum')).toBe(false);
    const forumSubdomain = items.find(
      (i) => i.path === '/' && i.studio === 'forum.buildwithoracle.com',
    );
    expect(forumSubdomain).toBeDefined();
  });
});
