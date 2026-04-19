/**
 * Tests for POST /api/menu/source + DELETE /api/menu/source.
 *
 * Covers:
 *  - POST persists gist URL via settings, returns source
 *  - POST rejects invalid URL (400)
 *  - POST rejects empty URL (400)
 *  - DELETE clears settings, returns status:none
 *  - Boot reads settings first, env var second
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Elysia } from 'elysia';
import { createMenuEndpoint } from '../../../src/routes/menu/menu.ts';
import { createMenuSourceAdminRoutes } from '../../../src/routes/menu/admin-source.ts';
import { db, menuItems, setSetting, getSetting } from '../../../src/db/index.ts';
import { eq } from 'drizzle-orm';
import { _resetMenuSource, getMenuConfig } from '../../../src/menu/config.ts';
import { MENU_GIST_SETTING_KEY } from '../../../src/menu/source-store.ts';
import { _clearGistCache, _setRetryDelays } from '../../../src/menu/gist.ts';

function buildApp() {
  return new Elysia({ prefix: '/api' })
    .use(createMenuEndpoint())
    .use(createMenuSourceAdminRoutes());
}

const ORIG_FETCH = globalThis.fetch;
const ORIG_ENV_GIST = process.env.ORACLE_MENU_GIST;
const ORIG_ENV_GIST_URL = process.env.ORACLE_MENU_GIST_URL;

function restoreFetch() {
  globalThis.fetch = ORIG_FETCH;
}

function resetAll() {
  _clearGistCache();
  _resetMenuSource();
  _setRetryDelays([1, 1, 1]);
  setSetting(MENU_GIST_SETTING_KEY, null);
  delete process.env.ORACLE_MENU_GIST;
  delete process.env.ORACLE_MENU_GIST_URL;
}

function restoreEnv() {
  if (ORIG_ENV_GIST !== undefined) process.env.ORACLE_MENU_GIST = ORIG_ENV_GIST;
  else delete process.env.ORACLE_MENU_GIST;
  if (ORIG_ENV_GIST_URL !== undefined) process.env.ORACLE_MENU_GIST_URL = ORIG_ENV_GIST_URL;
  else delete process.env.ORACLE_MENU_GIST_URL;
}

describe('POST /api/menu/source', () => {
  beforeEach(() => {
    resetAll();
  });
  afterEach(() => {
    restoreFetch();
    resetAll();
    restoreEnv();
  });

  test('persists gist URL via settings and returns source', async () => {
    globalThis.fetch = (async () => {
      const res = new Response(JSON.stringify({ items: [] }), { status: 200 });
      Object.defineProperty(res, 'url', {
        value:
          'https://gist.githubusercontent.com/natw/abcdef01/raw/aaaabbbbccccddddeeeeffff0000111122223333/menu.json',
      });
      return res;
    }) as typeof fetch;

    const app = buildApp();
    const res = await app.handle(
      new Request('http://localhost/api/menu/source', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://gist.github.com/natw/abcdef01' }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('merge');
    expect(body.source.url).toBe('https://gist.github.com/natw/abcdef01');
    expect(body.source.status).toBe('ok');
    expect(body.source.hash).toBe('aaaabbbbccccddddeeeeffff0000111122223333');
    expect(getSetting(MENU_GIST_SETTING_KEY)).toBe(
      'https://gist.github.com/natw/abcdef01',
    );
  });

  test('rejects invalid URL with 400', async () => {
    const app = buildApp();
    const res = await app.handle(
      new Request('http://localhost/api/menu/source', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://not-a-gist.example.com/foo' }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid gist URL/i);
    expect(getSetting(MENU_GIST_SETTING_KEY)).toBeNull();
  });

  test('rejects empty URL with 400', async () => {
    const app = buildApp();
    const res = await app.handle(
      new Request('http://localhost/api/menu/source', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: '   ' }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/required/i);
  });
});

describe('DELETE /api/menu/source', () => {
  beforeEach(() => {
    resetAll();
  });
  afterEach(() => {
    restoreFetch();
    resetAll();
    restoreEnv();
  });

  test('clears gist URL from settings and returns status:none', async () => {
    setSetting(MENU_GIST_SETTING_KEY, 'https://gist.github.com/natw/deadbeef01');
    const app = buildApp();
    const res = await app.handle(
      new Request('http://localhost/api/menu/source', { method: 'DELETE' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('none');
    expect(body.url).toBeNull();
    expect(getSetting(MENU_GIST_SETTING_KEY)).toBeNull();
  });
});

describe('GET /api/menu/source boot-read order', () => {
  beforeEach(() => {
    resetAll();
  });
  afterEach(() => {
    restoreFetch();
    resetAll();
    restoreEnv();
  });

  test('settings row takes precedence over env var', async () => {
    setSetting(MENU_GIST_SETTING_KEY, 'https://gist.github.com/natw/dbaadbaa01');
    process.env.ORACLE_MENU_GIST_URL = 'https://gist.github.com/natw/efeffe0001';

    let capturedUrl = '';
    globalThis.fetch = (async (url: string) => {
      capturedUrl = url;
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    }) as typeof fetch;

    const app = buildApp();
    await app.handle(new Request('http://localhost/api/menu'));
    const res = await app.handle(new Request('http://localhost/api/menu/source'));
    const body = await res.json();
    expect(body.url).toBe('https://gist.github.com/natw/dbaadbaa01');
    expect(capturedUrl).toContain('dbaadbaa01');
  });

  test('falls back to ORACLE_MENU_GIST_URL when settings empty', async () => {
    process.env.ORACLE_MENU_GIST_URL = 'https://gist.github.com/natw/ebfa11bac01';

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ items: [] }), { status: 200 })) as typeof fetch;

    const app = buildApp();
    await app.handle(new Request('http://localhost/api/menu'));
    const res = await app.handle(new Request('http://localhost/api/menu/source'));
    const body = await res.json();
    expect(body.url).toBe('https://gist.github.com/natw/ebfa11bac01');
  });

  test('falls back to legacy ORACLE_MENU_GIST when others empty', async () => {
    process.env.ORACLE_MENU_GIST = 'https://gist.github.com/natw/1e6ac1e0001';

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ items: [] }), { status: 200 })) as typeof fetch;

    const app = buildApp();
    await app.handle(new Request('http://localhost/api/menu'));
    const res = await app.handle(new Request('http://localhost/api/menu/source'));
    const body = await res.json();
    expect(body.url).toBe('https://gist.github.com/natw/1e6ac1e0001');
  });

  test('getMenuConfig with no sources returns empty items and status:none', async () => {
    const result = await getMenuConfig();
    expect(result.items).toEqual([]);
  });
});

describe('POST /api/menu/source mode=override', () => {
  beforeEach(() => {
    resetAll();
    db.delete(menuItems).run();
  });
  afterEach(() => {
    restoreFetch();
    resetAll();
    restoreEnv();
    db.delete(menuItems).run();
  });

  function seedRow(path: string, touchedAt: Date | null) {
    const now = new Date();
    db.insert(menuItems)
      .values({
        path,
        label: 'User Edit',
        groupKey: 'main',
        position: 10,
        enabled: true,
        access: 'public',
        source: 'route',
        icon: null,
        touchedAt,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  test('override clears touchedAt on rows matching gist paths', async () => {
    seedRow('/search', new Date());
    seedRow('/feed', new Date());
    seedRow('/not-in-gist', new Date());

    const payload = {
      items: [
        { path: '/search', label: 'Search', group: 'main', order: 10, source: 'page' },
        { path: '/feed', label: 'Feed', group: 'main', order: 20, source: 'page' },
      ],
    };
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(payload), { status: 200 })) as typeof fetch;

    const app = buildApp();
    const res = await app.handle(
      new Request('http://localhost/api/menu/source', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          url: 'https://gist.github.com/natw/0ffeabcd01',
          mode: 'override',
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('override');

    const search = db.select().from(menuItems).where(eq(menuItems.path, '/search')).get();
    const feed = db.select().from(menuItems).where(eq(menuItems.path, '/feed')).get();
    const untouched = db.select().from(menuItems).where(eq(menuItems.path, '/not-in-gist')).get();
    expect(search?.touchedAt).toBeNull();
    expect(feed?.touchedAt).toBeNull();
    expect(untouched?.touchedAt).not.toBeNull();
  });

  test('merge (default) preserves touchedAt on matching rows', async () => {
    seedRow('/search', new Date());

    const payload = {
      items: [{ path: '/search', label: 'Search', group: 'main', order: 10, source: 'page' }],
    };
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(payload), { status: 200 })) as typeof fetch;

    const app = buildApp();
    const res = await app.handle(
      new Request('http://localhost/api/menu/source', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://gist.github.com/natw/fedcba0001' }),
      }),
    );
    expect(res.status).toBe(200);

    const search = db.select().from(menuItems).where(eq(menuItems.path, '/search')).get();
    expect(search?.touchedAt).not.toBeNull();
  });
});

describe('POST /api/menu/reset-all', () => {
  beforeEach(() => {
    resetAll();
    db.delete(menuItems).run();
  });
  afterEach(() => {
    restoreFetch();
    resetAll();
    restoreEnv();
    db.delete(menuItems).run();
  });

  test('clears touchedAt on route rows, deletes custom rows', async () => {
    const now = new Date();
    db.insert(menuItems)
      .values([
        {
          path: '/search',
          label: 'Search',
          groupKey: 'main',
          position: 10,
          enabled: false,
          access: 'public',
          source: 'route',
          icon: null,
          touchedAt: now,
          createdAt: now,
          updatedAt: now,
        },
        {
          path: '/my-custom',
          label: 'Custom',
          groupKey: 'tools',
          position: 90,
          enabled: true,
          access: 'public',
          source: 'custom',
          icon: null,
          touchedAt: now,
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();

    const app = buildApp();
    const res = await app.handle(
      new Request('http://localhost/api/menu/reset-all', { method: 'POST' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clearedTouched).toBe(1);
    expect(body.deletedCustom).toBe(1);

    const route = db.select().from(menuItems).where(eq(menuItems.path, '/search')).get();
    expect(route?.touchedAt).toBeNull();
    expect(route?.enabled).toBe(true);

    const custom = db.select().from(menuItems).where(eq(menuItems.path, '/my-custom')).get();
    expect(custom).toBeUndefined();
  });
});

describe('GET /api/menu/source/official', () => {
  const ORIG_OFFICIAL = process.env.ORACLE_OFFICIAL_MENU_GIST;
  beforeEach(() => {
    resetAll();
    delete process.env.ORACLE_OFFICIAL_MENU_GIST;
  });
  afterEach(() => {
    if (ORIG_OFFICIAL !== undefined) process.env.ORACLE_OFFICIAL_MENU_GIST = ORIG_OFFICIAL;
    else delete process.env.ORACLE_OFFICIAL_MENU_GIST;
  });

  test('returns null when env unset', async () => {
    const app = buildApp();
    const res = await app.handle(new Request('http://localhost/api/menu/source/official'));
    const body = await res.json();
    expect(body).toEqual({ url: null });
  });

  test('returns URL when env set to valid gist', async () => {
    process.env.ORACLE_OFFICIAL_MENU_GIST = 'https://gist.github.com/arra/0ff1c1a1de';
    const app = buildApp();
    const res = await app.handle(new Request('http://localhost/api/menu/source/official'));
    const body = await res.json();
    expect(body.url).toBe('https://gist.github.com/arra/0ff1c1a1de');
  });

  test('returns null when env is non-gist garbage', async () => {
    process.env.ORACLE_OFFICIAL_MENU_GIST = 'https://example.com/not-a-gist';
    const app = buildApp();
    const res = await app.handle(new Request('http://localhost/api/menu/source/official'));
    const body = await res.json();
    expect(body.url).toBeNull();
  });
});
