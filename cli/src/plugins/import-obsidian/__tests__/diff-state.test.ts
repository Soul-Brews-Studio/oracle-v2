import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPlan, loadState } from '../lib/diff-state.ts';
import type { ImportDoc, VaultState } from '../lib/types.ts';

let vault: string;

beforeEach(async () => {
  vault = await mkdtemp(join(tmpdir(), 'diff-state-test-'));
});

afterEach(async () => {
  await rm(vault, { recursive: true, force: true });
});

function mkDoc(id: string | undefined, hash: string, rel = 'a.md'): ImportDoc {
  return {
    absPath: `/tmp/${rel}`,
    relPath: rel,
    meta: id ? { arra_id: id, arra_type: 'learning' } : { arra_type: 'learning' },
    body: 'body',
    title: 'T',
    concepts: ['x'],
    contentHash: hash,
  };
}

describe('loadState', () => {
  test('returns null when state file missing', async () => {
    const s = await loadState(vault);
    expect(s).toBeNull();
  });

  test('reads a valid state file', async () => {
    const state: VaultState = {
      version: 1,
      last_export: '2026-04-19T00:00:00Z',
      docs: { abc: { relPath: 'a.md', contentHash: 'h1' } },
    };
    await writeFile(join(vault, '.arra-vault-state.json'), JSON.stringify(state));
    const s = await loadState(vault);
    expect(s?.docs.abc?.contentHash).toBe('h1');
  });
});

describe('buildPlan', () => {
  test('classifies unchanged / update / skip-no-id / create', () => {
    const docs: ImportDoc[] = [
      mkDoc('abc', 'h1', 'a.md'), // unchanged
      mkDoc('def', 'newHash', 'b.md'), // changed
      mkDoc(undefined, 'h3', 'c.md'), // no id → skip
    ];
    const state: VaultState = {
      version: 1,
      last_export: '',
      docs: {
        abc: { relPath: 'a.md', contentHash: 'h1' },
        def: { relPath: 'b.md', contentHash: 'OLD' },
      },
    };
    const plan = buildPlan(docs, state, {
      onlyChanged: true,
      createNew: false,
      deleteMissing: false,
      types: null,
    });
    expect(plan.summary.unchanged).toBe(1);
    expect(plan.summary.changed).toBe(1);
    expect(plan.summary.skippedNoId).toBe(1);
    expect(plan.summary.created).toBe(0);
  });

  test('--create-new flips no-id into create', () => {
    const docs = [mkDoc(undefined, 'h', 'x.md')];
    const plan = buildPlan(docs, null, {
      onlyChanged: true,
      createNew: true,
      deleteMissing: false,
      types: null,
    });
    expect(plan.summary.created).toBe(1);
    expect(plan.summary.skippedNoId).toBe(0);
  });

  test('--all overrides onlyChanged (pushes unchanged)', () => {
    const docs = [mkDoc('abc', 'h1', 'a.md')];
    const state: VaultState = {
      version: 1,
      last_export: '',
      docs: { abc: { relPath: 'a.md', contentHash: 'h1' } },
    };
    const plan = buildPlan(docs, state, {
      onlyChanged: false,
      createNew: false,
      deleteMissing: false,
      types: null,
    });
    expect(plan.summary.changed).toBe(1);
    expect(plan.summary.unchanged).toBe(0);
  });

  test('--delete-missing queues tombstones for state entries missing from vault', () => {
    const docs = [mkDoc('abc', 'h1', 'a.md')];
    const state: VaultState = {
      version: 1,
      last_export: '',
      docs: {
        abc: { relPath: 'a.md', contentHash: 'h1' },
        gone: { relPath: 'gone.md', contentHash: 'zz' },
      },
    };
    const plan = buildPlan(docs, state, {
      onlyChanged: true,
      createNew: false,
      deleteMissing: true,
      types: null,
    });
    expect(plan.summary.tombstoned).toBe(1);
  });

  test('types filter excludes non-matching docs', () => {
    const docs = [
      { ...mkDoc('abc', 'h', 'a.md'), meta: { arra_id: 'abc', arra_type: 'retro' } },
      mkDoc('def', 'h2', 'b.md'),
    ];
    const plan = buildPlan(docs, null, {
      onlyChanged: true,
      createNew: false,
      deleteMissing: false,
      types: ['learning'],
    });
    expect(plan.items.length).toBe(1);
    expect(plan.items[0]!.doc?.meta.arra_id).toBe('def');
  });
});
