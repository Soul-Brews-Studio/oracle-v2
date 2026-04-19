import { afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { applyPlan, composeContent } from '../lib/apply-changes.ts';
import type { ImportDoc, ImportPlan } from '../lib/types.ts';

// Monkey-patch global fetch so we can intercept /api/doc calls without
// spinning up a real server. apiFetch uses global fetch under the hood.
const realFetch = globalThis.fetch;
let calls: { url: string; method: string; body: unknown }[] = [];

beforeAll(() => {
  // no-op
});

afterEach(() => {
  globalThis.fetch = realFetch;
  calls = [];
});

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.url;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method: init?.method ?? 'GET', body });
    return handler(url, init);
  }) as typeof fetch;
}

function doc(id: string | undefined, rel = 'a.md'): ImportDoc {
  return {
    absPath: `/tmp/${rel}`,
    relPath: rel,
    meta: id ? { arra_id: id, arra_type: 'learning' } : { arra_type: 'learning' },
    body: 'content',
    title: 'Title',
    concepts: ['x', 'y'],
    contentHash: 'h',
  };
}

describe('composeContent', () => {
  test('prepends H1 title', () => {
    expect(composeContent(doc('a'))).toContain('# Title');
    expect(composeContent(doc('a'))).toContain('content');
  });

  test('no body → bare title', () => {
    const d = { ...doc('a'), body: '' };
    expect(composeContent(d).trim()).toBe('# Title');
  });
});

describe('applyPlan', () => {
  test('dry-run makes no fetch calls', async () => {
    mockFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const plan: ImportPlan = {
      items: [{ doc: doc('a'), action: 'update' }],
      summary: { changed: 1, created: 0, unchanged: 0, skippedNoId: 0, tombstoned: 0 },
    };
    const r = await applyPlan(plan, { dryRun: true, verbose: false, log: () => {} });
    expect(calls.length).toBe(0);
    expect(r.applied).toBe(1);
  });

  test('update → PATCH /api/doc/:id', async () => {
    mockFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const plan: ImportPlan = {
      items: [{ doc: doc('abc'), action: 'update' }],
      summary: { changed: 1, created: 0, unchanged: 0, skippedNoId: 0, tombstoned: 0 },
    };
    const r = await applyPlan(plan, { dryRun: false, verbose: false, log: () => {} });
    expect(r.applied).toBe(1);
    expect(r.failed).toBe(0);
    expect(calls[0]!.method).toBe('PATCH');
    expect(calls[0]!.url).toContain('/api/doc/abc');
    const body = calls[0]!.body as any;
    expect(body.concepts).toEqual(['x', 'y']);
    expect(body.content).toContain('# Title');
  });

  test('create → POST /api/doc', async () => {
    mockFetch(() => new Response(JSON.stringify({ ok: true, id: 'new_id' }), { status: 200 }));
    const plan: ImportPlan = {
      items: [{ doc: doc(undefined, 'n.md'), action: 'create' }],
      summary: { changed: 0, created: 1, unchanged: 0, skippedNoId: 0, tombstoned: 0 },
    };
    const r = await applyPlan(plan, { dryRun: false, verbose: false, log: () => {} });
    expect(r.created).toBe(1);
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toContain('/api/doc');
  });

  test('skip-no-id logs a warning, no fetch', async () => {
    mockFetch(() => new Response('', { status: 500 }));
    const logs: string[] = [];
    const plan: ImportPlan = {
      items: [{ doc: doc(undefined), action: 'skip-no-id' }],
      summary: { changed: 0, created: 0, unchanged: 0, skippedNoId: 1, tombstoned: 0 },
    };
    const r = await applyPlan(plan, { dryRun: false, verbose: false, log: (s) => logs.push(s) });
    expect(calls.length).toBe(0);
    expect(r.skipped).toBe(1);
    expect(logs.some((l) => l.includes('no arra_id'))).toBe(true);
  });

  test('PATCH HTTP error → recorded as failure', async () => {
    mockFetch(() => new Response('boom', { status: 500 }));
    const plan: ImportPlan = {
      items: [{ doc: doc('abc'), action: 'update' }],
      summary: { changed: 1, created: 0, unchanged: 0, skippedNoId: 0, tombstoned: 0 },
    };
    const r = await applyPlan(plan, { dryRun: false, verbose: false, log: () => {} });
    expect(r.failed).toBe(1);
    expect(r.errors[0]?.message).toContain('HTTP 500');
  });
});
