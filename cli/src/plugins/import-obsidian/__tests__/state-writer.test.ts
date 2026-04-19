import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeState, buildUpdatedState } from '../lib/state-writer.ts';
import type { ImportDoc, VaultState } from '../lib/types.ts';

let vault: string;

beforeEach(async () => {
  vault = await mkdtemp(join(tmpdir(), 'state-writer-test-'));
});

afterEach(async () => {
  await rm(vault, { recursive: true, force: true });
});

function mkDoc(id: string, hash: string, rel = 'a.md'): ImportDoc {
  return {
    absPath: `/tmp/${rel}`,
    relPath: rel,
    meta: { arra_id: id },
    body: 'x',
    title: 'T',
    concepts: [],
    contentHash: hash,
  };
}

describe('state-writer', () => {
  test('writes state atomically', async () => {
    const state: VaultState = {
      version: 1,
      last_export: '2026-04-19T00:00:00Z',
      docs: { a: { relPath: 'a.md', contentHash: 'h1' } },
    };
    await writeState(vault, state);
    const raw = await readFile(join(vault, '.arra-vault-state.json'), 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed.docs.a.contentHash).toBe('h1');
  });

  test('buildUpdatedState merges prior state with new doc hashes', () => {
    const prior: VaultState = {
      version: 1,
      last_export: '2026-01-01T00:00:00Z',
      docs: {
        keep: { relPath: 'keep.md', contentHash: 'kh' },
        stale: { relPath: 'stale.md', contentHash: 'old' },
      },
    };
    const next = buildUpdatedState(prior, [mkDoc('stale', 'new', 'stale.md'), mkDoc('fresh', 'fh', 'fresh.md')]);
    expect(next.docs.keep?.contentHash).toBe('kh');
    expect(next.docs.stale?.contentHash).toBe('new');
    expect(next.docs.fresh?.contentHash).toBe('fh');
  });

  test('buildUpdatedState handles null prior state', () => {
    const next = buildUpdatedState(null, [mkDoc('a', 'h', 'a.md')]);
    expect(next.docs.a?.contentHash).toBe('h');
    expect(next.version).toBe(1);
  });
});
