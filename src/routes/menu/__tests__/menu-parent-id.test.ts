/**
 * #949 follow-up: parentId round-trip on /api/menu.
 * Shared-ui's buildNavSet attaches children by id/parentId, so the public
 * endpoint must expose both as strings (DB column is integer).
 */

import { describe, it, expect } from 'bun:test';
import { eq } from 'drizzle-orm';
import { readApiMenuItemsFromDb } from '../menu.ts';
import { db, menuItems } from '../../../db/index.ts';

describe('readApiMenuItemsFromDb — id + parentId', () => {
  it('exposes id and parentId as strings so buildNavSet can attach children', () => {
    const now = new Date();
    const parentPath = `/__parent_${Date.now()}`;
    const childPath = `${parentPath}/kid`;

    try {
      const parent = db
        .insert(menuItems)
        .values({
          path: parentPath,
          label: 'Parent',
          groupKey: 'tools',
          position: 700,
          enabled: true,
          access: 'public',
          source: 'custom',
          touchedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();

      db
        .insert(menuItems)
        .values({
          path: childPath,
          label: 'Child',
          groupKey: 'tools',
          parentId: parent.id,
          position: 701,
          enabled: true,
          access: 'public',
          source: 'custom',
          touchedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      const items = readApiMenuItemsFromDb();
      const parentItem = items.find((i) => i.path === parentPath);
      const childItem = items.find((i) => i.path === childPath);

      expect(parentItem).toBeDefined();
      expect(parentItem!.id).toBe(String(parent.id));
      expect(parentItem!.parentId).toBeNull();

      expect(childItem).toBeDefined();
      expect(childItem!.parentId).toBe(String(parent.id));
    } finally {
      db.delete(menuItems).where(eq(menuItems.path, childPath)).run();
      db.delete(menuItems).where(eq(menuItems.path, parentPath)).run();
    }
  });
});
