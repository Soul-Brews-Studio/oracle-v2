// Load .arra-vault-state.json and classify each parsed vault doc as
// update / create / skip-unchanged / skip-no-id / tombstone.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ImportDoc, ImportPlan, ImportPlanItem, VaultState } from './types.ts';

const STATE_FILE = '.arra-vault-state.json';

export async function loadState(vaultDir: string): Promise<VaultState | null> {
  try {
    const raw = await readFile(join(vaultDir, STATE_FILE), 'utf8');
    const parsed = JSON.parse(raw) as VaultState;
    if (!parsed || typeof parsed !== 'object' || !parsed.docs) return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface DiffOptions {
  onlyChanged: boolean;
  createNew: boolean;
  deleteMissing: boolean;
  types: string[] | null;
}

export function buildPlan(
  docs: ImportDoc[],
  state: VaultState | null,
  opts: DiffOptions,
): ImportPlan {
  const items: ImportPlanItem[] = [];
  const summary = { changed: 0, created: 0, unchanged: 0, skippedNoId: 0, tombstoned: 0 };

  const seenIds = new Set<string>();

  for (const doc of docs) {
    if (opts.types && opts.types.length > 0) {
      const t = (doc.meta.arra_type as string | undefined) ?? '';
      if (!opts.types.includes(t)) continue;
    }
    const id = typeof doc.meta.arra_id === 'string' ? doc.meta.arra_id : undefined;

    if (!id) {
      if (opts.createNew) {
        items.push({ doc, action: 'create', reason: 'no arra_id → --create-new' });
        summary.created++;
      } else {
        items.push({ doc, action: 'skip-no-id', reason: 'no arra_id — pass --create-new to create' });
        summary.skippedNoId++;
      }
      continue;
    }

    seenIds.add(id);
    const prev = state?.docs[id];
    if (opts.onlyChanged && prev && prev.contentHash === doc.contentHash) {
      items.push({ doc, action: 'skip-unchanged' });
      summary.unchanged++;
      continue;
    }
    items.push({ doc, action: 'update' });
    summary.changed++;
  }

  if (opts.deleteMissing && state) {
    for (const [id, entry] of Object.entries(state.docs)) {
      if (seenIds.has(id)) continue;
      items.push({ arraId: id, relPath: entry.relPath, action: 'tombstone' });
      summary.tombstoned++;
    }
  }

  return { items, summary };
}
