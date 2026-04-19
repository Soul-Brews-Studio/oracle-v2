/**
 * #948: hidden column round-trip.
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
  touchedAt: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  ...over,
});

describe('toResponse — hidden field', () => {
  it('defaults hidden:false in response', () => {
    expect(toResponse(row({})).hidden).toBe(false);
  });

  it('passes hidden:true through', () => {
    expect(toResponse(row({ hidden: true })).hidden).toBe(true);
  });
});

describe('menu_items hidden column — DB round-trip', () => {
  it('persists hidden:true and surfaces it on admin list + /api/menu', () => {
    const now = new Date();
    const path = `/__hidden_test_${Date.now()}`;

    try {
      const inserted = db
        .insert(menuItems)
        .values({
          path,
          label: 'Hidden Test',
          groupKey: 'tools',
          position: 500,
          enabled: true,
          access: 'public',
          source: 'custom',
          hidden: true,
          touchedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();

      expect(inserted.hidden).toBe(true);
      expect(toResponse(inserted).hidden).toBe(true);

      const apiItem = readApiMenuItemsFromDb().find((i) => i.path === path);
      expect(apiItem).toBeDefined();
      expect(apiItem!.hidden).toBe(true);
    } finally {
      db.delete(menuItems).where(eq(menuItems.path, path)).run();
    }
  });
});
