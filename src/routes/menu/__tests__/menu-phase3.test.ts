/**
 * Phase 3 backend tests: parentId tree nesting, host glob filter, orphan fallback.
 */

import { describe, it, expect } from 'bun:test';
import { buildTree } from '../admin.ts';
import { hostMatches } from '../menu.ts';

type Row = Parameters<typeof buildTree>[0][number];

const base = (over: Partial<Row>): Row => ({
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

describe('buildTree', () => {
  it('nests children under matching parents', () => {
    const rows = [
      base({ id: 1, path: '/a', label: 'A', parentId: null, position: 0 }),
      base({ id: 2, path: '/a/x', label: 'A.X', parentId: 1, position: 1 }),
      base({ id: 3, path: '/a/y', label: 'A.Y', parentId: 1, position: 2 }),
      base({ id: 4, path: '/b', label: 'B', parentId: null, position: 3 }),
    ];
    const tree = buildTree(rows);
    expect(tree.map((n) => n.id)).toEqual([1, 4]);
    const a = tree.find((n) => n.id === 1)!;
    expect(a.children.map((c) => c.id)).toEqual([2, 3]);
    expect(tree.find((n) => n.id === 4)!.children).toEqual([]);
  });

  it('promotes orphans (parentId → missing) to root-level', () => {
    const rows = [
      base({ id: 1, path: '/orphan', parentId: 999, position: 0 }),
      base({ id: 2, path: '/keep', parentId: null, position: 1 }),
    ];
    const tree = buildTree(rows);
    expect(tree.map((n) => n.id).sort()).toEqual([1, 2]);
  });
});

describe('hostMatches', () => {
  it('null pattern matches any host (show everywhere)', () => {
    expect(hostMatches(null, 'vector.foo.com')).toBe(true);
    expect(hostMatches(undefined, 'studio.bar.com')).toBe(true);
  });

  it('glob `vector.*` matches vector subdomains only', () => {
    expect(hostMatches('vector.*', 'vector.foo.com')).toBe(true);
    expect(hostMatches('vector.*', 'studio.foo.com')).toBe(false);
  });

  it('exact literal matches only itself', () => {
    expect(hostMatches('studio.arra.dev', 'studio.arra.dev')).toBe(true);
    expect(hostMatches('studio.arra.dev', 'studio.arra.dev.evil.com')).toBe(false);
  });

  it('escapes regex metachars so dots are literal', () => {
    expect(hostMatches('vector.foo', 'vectorXfoo')).toBe(false);
  });
});
