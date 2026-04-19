/**
 * #958 submenu reorg: verify seeder's reparent post-pass wires known
 * children to Tools/Canvas parents. Migration 0011 owns parent-row
 * creation + /feed+/schedule demotion + Planets seed; this suite only
 * covers the seeder contract on top of that.
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { eq, inArray } from 'drizzle-orm';
import { db, menuItems } from '../../../db/index.ts';
import { seedMenuItems } from '../../../db/seeders/menu-seeder.ts';
import { buildTree } from '../admin.ts';

const CHILD_PATHS = ['/playground', '/forum', '/plugins', '/evolution', '/pulse', '/map'] as const;
const ALL_PATHS = ['#tools', '#canvas', '/planets', ...CHILD_PATHS] as const;

function insertParent(path: string, label: string, position: number): number {
  const now = new Date();
  return db.insert(menuItems).values({
    path, label, groupKey: 'main', position,
    enabled: true, access: 'public', source: 'custom',
    touchedAt: now, createdAt: now, updatedAt: now,
  }).returning().get().id;
}

function insertChild(path: string, position: number): number {
  const now = new Date();
  return db.insert(menuItems).values({
    path, label: `seed ${path}`,
    groupKey: path === '/map' ? 'tools' : 'main',
    position, enabled: true, access: 'public', source: 'route',
    createdAt: now, updatedAt: now,
  }).returning().get().id;
}

function insertCanvasChild(path: string, position: number, query: string, canvasId: number): number {
  const now = new Date();
  return db.insert(menuItems).values({
    path, label: `seed ${path}`, groupKey: 'main',
    parentId: canvasId, position, enabled: true, access: 'public', source: 'custom',
    query, touchedAt: now, createdAt: now, updatedAt: now,
  }).returning().get().id;
}

describe('#958 submenu reorg — seeder reparent post-pass', () => {
  let toolsId = 0;
  let canvasId = 0;

  beforeAll(() => {
    db.delete(menuItems).where(inArray(menuItems.path, ALL_PATHS as unknown as string[])).run();
    toolsId = insertParent('#tools', 'Tools', 40);
    canvasId = insertParent('#canvas', 'Canvas', 50);
    CHILD_PATHS.forEach((p, i) => insertChild(p, 100 + i));
    insertCanvasChild('/planets', 20, '{"plugin":"planets"}', canvasId);
    seedMenuItems([]);
  });

  afterAll(() => {
    db.delete(menuItems).where(inArray(menuItems.path, ALL_PATHS as unknown as string[])).run();
  });

  it('reparents five Tools children', () => {
    for (const p of ['/playground', '/forum', '/plugins', '/evolution', '/pulse']) {
      const row = db.select().from(menuItems).where(eq(menuItems.path, p)).get();
      expect(row?.parentId, `parent of ${p}`).toBe(toolsId);
    }
  });

  it('reparents /map under Canvas without clobbering groupKey', () => {
    const map = db.select().from(menuItems).where(eq(menuItems.path, '/map')).get();
    expect(map?.parentId).toBe(canvasId);
    expect(map?.groupKey).toBe('tools');
  });

  it('leaves Planets (custom row) under Canvas with query payload', () => {
    const planets = db.select().from(menuItems).where(eq(menuItems.path, '/planets')).get();
    expect(planets?.parentId).toBe(canvasId);
    expect(planets?.query).toBe('{"plugin":"planets"}');
  });

  it('second seedMenuItems call is a no-op (reparenting is idempotent)', () => {
    const result = seedMenuItems([]);
    expect(result).toEqual({ inserted: 0, updated: 0, preserved: 0 });
  });

  it('buildTree surfaces Tools w/ 5 children and Canvas w/ 2', () => {
    const rows = db.select().from(menuItems).where(inArray(menuItems.path, ALL_PATHS as unknown as string[])).all();
    const tree = buildTree(rows);
    const tools = tree.find((n) => n.path === '#tools');
    const canvas = tree.find((n) => n.path === '#canvas');
    expect(tools?.children.length).toBe(5);
    expect(canvas?.children.length).toBe(2);
    expect(canvas?.children.map((c) => c.path).sort()).toEqual(['/map', '/planets']);
  });
});
