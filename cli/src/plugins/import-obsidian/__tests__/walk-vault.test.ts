import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { walkVault } from '../lib/walk-vault.ts';

let vault: string;

beforeEach(async () => {
  vault = await mkdtemp(join(tmpdir(), 'walk-vault-test-'));
});

afterEach(async () => {
  await rm(vault, { recursive: true, force: true });
});

describe('walkVault', () => {
  test('finds .md files, skips _index + _concepts + .obsidian + state file', async () => {
    await mkdir(join(vault, 'learnings'), { recursive: true });
    await mkdir(join(vault, '_concepts'), { recursive: true });
    await mkdir(join(vault, '.obsidian'), { recursive: true });

    await writeFile(join(vault, '_index.md'), '# index');
    await writeFile(join(vault, '_concepts', 'hub.md'), '# hub');
    await writeFile(join(vault, '.obsidian', 'config'), '{}');
    await writeFile(join(vault, '.arra-vault-state.json'), '{}');
    await writeFile(join(vault, 'learnings', 'a.md'), '# a');
    await writeFile(join(vault, 'learnings', 'b.md'), '# b');
    await writeFile(join(vault, 'learnings', 'notes.txt'), 'skip me');

    const entries = await walkVault(vault);
    const rels = entries.map((e) => e.relPath).sort();
    expect(rels).toEqual(['learnings/a.md', 'learnings/b.md']);
  });

  test('returns empty on missing directory', async () => {
    const out = await walkVault(join(vault, 'nope'));
    expect(out).toEqual([]);
  });
});
