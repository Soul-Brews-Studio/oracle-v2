/**
 * #957: query JSON column round-trip.
 * Exercises toResponse (admin list) and readApiMenuItemsFromDb (/api/menu).
 */

import { describe, it, expect } from 'bun:test';
import { eq } from 'drizzle-orm';
import { toResponse } from '../admin.ts';
import { readApiMenuItemsFromDb } from '../menu.ts';
import { db, menuItems } from '../../../db/index.ts';

type Row = Parameters<typeof toResponse>[0];

const row = (over: Partial<Row>): Row => ({
  id: 1,
  path: '/x',
  label: 'X',
  groupKey: 'main',
  parentId: null,
  position: 0,
  enabled: true,
  access: 'public',
  source: 'route',
  icon: null,
  host: null,
  hidden: false,
  query: null,
  touchedAt: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  ...over,
});

describe('toResponse — query field', () => {
  it('returns null when query column is null', () => {
    expect(toResponse(row({})).query).toBeNull();
  });

  it('parses JSON-encoded query back into a Record', () => {
    const r = row({ query: JSON.stringify({ plugin: 'planets' }) });
    expect(toResponse(r).query).toEqual({ plugin: 'planets' });
  });

  it('rejects malformed JSON and returns null', () => {
    expect(toResponse(row({ query: '{not-json' })).query).toBeNull();
  });
});

describe('menu_items query column — DB round-trip', () => {
  it('persists query JSON and surfaces it on admin list + /api/menu', () => {
    const now = new Date();
    const path = `/__query_test_${Date.now()}`;

    try {
      const inserted = db
        .insert(menuItems)
        .values({
          path,
          label: 'Query Test',
          groupKey: 'tools',
          position: 500,
          enabled: true,
          access: 'public',
          source: 'custom',
          query: JSON.stringify({ plugin: 'map' }),
          touchedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();

      expect(inserted.query).toBe('{"plugin":"map"}');
      expect(toResponse(inserted).query).toEqual({ plugin: 'map' });

      const apiItem = readApiMenuItemsFromDb().find((i) => i.path === path);
      expect(apiItem).toBeDefined();
      expect(apiItem!.query).toEqual({ plugin: 'map' });
    } finally {
      db.delete(menuItems).where(eq(menuItems.path, path)).run();
    }
  });

  it('null query remains null through admin + /api/menu', () => {
    const now = new Date();
    const path = `/__query_null_test_${Date.now()}`;

    try {
      const inserted = db
        .insert(menuItems)
        .values({
          path,
          label: 'Query Null',
          groupKey: 'tools',
          position: 501,
          enabled: true,
          access: 'public',
          source: 'custom',
          touchedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();

      expect(inserted.query).toBeNull();
      expect(toResponse(inserted).query).toBeNull();

      const apiItem = readApiMenuItemsFromDb().find((i) => i.path === path);
      expect(apiItem).toBeDefined();
      expect(apiItem!.query).toBeUndefined();
    } finally {
      db.delete(menuItems).where(eq(menuItems.path, path)).run();
    }
  });
});
