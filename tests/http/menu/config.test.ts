/**
 * Tests for /api/menu configuration — env disable, DB disable, gist overlay.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Elysia } from 'elysia';
import { buildMenuItems, type MenuItem } from '../../../src/routes/menu/index.ts';
import { fetchGistMenu, toRawGistUrl, _clearGistCache } from '../../../src/menu/gist.ts';

const ORIG_FETCH = globalThis.fetch;

function restoreFetch() {
  globalThis.fetch = ORIG_FETCH;
}

describe('buildMenuItems with extras', () => {
  test('disable set filters out items', () => {
    const sub = new Elysia({ prefix: '/api' }).get('/search', () => ({}), {
      detail: { tags: ['nav:main', 'order:10'], summary: 'Search' },
    });
    const items = buildMenuItems([sub], { disable: ['/search'] });
    expect(items.find((i) => i.path === '/search')).toBeUndefined();
  });

  test('extras.items appended (gist merge)', () => {
    const extra: MenuItem = {
      path: '/lab',
      label: 'Lab',
      group: 'tools',
      order: 90,
      source: 'page',
    };
    const items = buildMenuItems([], { items: [extra] });
    expect(items.find((i) => i.path === '/lab')).toMatchObject({
      label: 'Lab',
      group: 'tools',
      order: 90,
    });
  });

  test('disable applies to gist-added items too', () => {
    const extra: MenuItem = {
      path: '/lab',
      label: 'Lab',
      group: 'tools',
      order: 90,
      source: 'page',
    };
    const items = buildMenuItems([], { items: [extra], disable: ['/lab'] });
    expect(items.find((i) => i.path === '/lab')).toBeUndefined();
  });

  test('disable also filters frontend-declared items', () => {
    const items = buildMenuItems([], { disable: ['/canvas'] });
    expect(items.find((i) => i.path === '/canvas')).toBeUndefined();
  });

  test('deduplicates gist item against existing frontend entry', () => {
    const dupe: MenuItem = {
      path: '/canvas',
      label: 'Canvas Override',
      group: 'tools',
      order: 1,
      source: 'page',
    };
    const items = buildMenuItems([], { items: [dupe] });
    const canvases = items.filter((i) => i.path === '/canvas');
    expect(canvases).toHaveLength(1);
    expect(canvases[0].label).toBe('Canvas');
  });
});

describe('fetchGistMenu', () => {
  beforeEach(() => {
    _clearGistCache();
  });
  afterEach(() => {
    restoreFetch();
    _clearGistCache();
  });

  test('transforms gist page URL to raw URL', () => {
    expect(toRawGistUrl('https://gist.github.com/natw/abc123def456')).toBe(
      'https://gist.githubusercontent.com/natw/abc123def456/raw/',
    );
  });

  test('raw URL is passed through unchanged', () => {
    const raw = 'https://gist.githubusercontent.com/natw/abc123def456/raw/';
    expect(toRawGistUrl(raw)).toBe(raw);
  });

  test('fetches and parses gist JSON', async () => {
    const payload = {
      items: [
        { path: '/lab', label: 'Lab', group: 'tools', order: 90, source: 'page' },
      ],
      disable: ['/superseded'],
    };
    let called = '';
    globalThis.fetch = (async (url: string) => {
      called = url;
      return new Response(JSON.stringify(payload), { status: 200 });
    }) as typeof fetch;

    const result = await fetchGistMenu('https://gist.github.com/natw/abc123def456');
    expect(called).toBe('https://gist.githubusercontent.com/natw/abc123def456/raw/');
    expect(result).toEqual(payload);
  });

  test('unreachable gist returns null without crashing', async () => {
    globalThis.fetch = (async () => {
      throw new Error('ENOTFOUND');
    }) as typeof fetch;
    const result = await fetchGistMenu('https://gist.github.com/natw/deadbeef00');
    expect(result).toBeNull();
  });

  test('non-200 response returns null', async () => {
    globalThis.fetch = (async () =>
      new Response('not found', { status: 404 })) as typeof fetch;
    const result = await fetchGistMenu('https://gist.github.com/natw/deadbeef01');
    expect(result).toBeNull();
  });

  test('caches results across calls', async () => {
    let callCount = 0;
    globalThis.fetch = (async () => {
      callCount += 1;
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    }) as typeof fetch;

    await fetchGistMenu('https://gist.github.com/natw/cache01');
    await fetchGistMenu('https://gist.github.com/natw/cache01');
    expect(callCount).toBe(1);
  });
});
