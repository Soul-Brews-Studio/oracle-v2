// Write .arra-vault-state.json atomically (temp + rename).
// Only called on successful non-dry-run imports / exports.

import { mkdir, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ImportDoc, VaultState } from './types.ts';

const STATE_FILE = '.arra-vault-state.json';

export async function writeState(vaultDir: string, state: VaultState): Promise<void> {
  const abs = join(vaultDir, STATE_FILE);
  await mkdir(dirname(abs), { recursive: true });
  const tmp = `${abs}.tmp-${process.pid}-${Date.now().toString(36)}`;
  await Bun.write(tmp, JSON.stringify(state, null, 2) + '\n');
  await rename(tmp, abs);
}

/** Merge a prior state with the docs we just imported; any doc that now has
 * an arra_id + contentHash gets its entry refreshed. Missing docs are left
 * alone unless removeIds is provided. */
export function buildUpdatedState(
  prior: VaultState | null,
  docs: ImportDoc[],
  defaults: { model?: string; threshold?: number } = {},
): VaultState {
  const next: VaultState = {
    version: 1,
    last_export: new Date().toISOString(),
    model: defaults.model ?? prior?.model,
    threshold: defaults.threshold ?? prior?.threshold,
    docs: { ...(prior?.docs ?? {}) },
  };
  for (const d of docs) {
    const id = typeof d.meta.arra_id === 'string' ? d.meta.arra_id : undefined;
    if (!id) continue;
    next.docs[id] = { relPath: d.relPath, contentHash: d.contentHash };
  }
  return next;
}
