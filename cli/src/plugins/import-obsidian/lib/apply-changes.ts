// Apply an ImportPlan against the ARRA Oracle HTTP API.
// - 'update' → PATCH /api/doc/:id with { content, concepts, title }
// - 'create' → POST /api/doc with full doc (skipped unless --create-new)
// - 'skip-unchanged' / 'skip-no-id' → no-op
// - 'tombstone' → POST /api/supersede (if endpoint present) OR warn + skip
//   (for Phase 1 we warn + skip tombstones; --delete-missing default is OFF)

import { apiFetch } from '../../../lib/api.ts';
import type { ImportDoc, ImportPlan, ImportResult, ImportPlanItem } from './types.ts';

export interface ApplyOptions {
  dryRun: boolean;
  verbose: boolean;
  log: (line: string) => void;
}

export async function applyPlan(plan: ImportPlan, opts: ApplyOptions): Promise<ImportResult> {
  const result: ImportResult = { applied: 0, created: 0, failed: 0, skipped: 0, errors: [] };

  for (const item of plan.items) {
    try {
      if (item.action === 'skip-unchanged') {
        result.skipped++;
        if (opts.verbose && item.doc) opts.log(`  unchanged: ${item.doc.relPath}`);
        continue;
      }
      if (item.action === 'skip-no-id') {
        result.skipped++;
        const rel = item.doc?.relPath ?? '?';
        opts.log(`  WARN skip (no arra_id): ${rel} — rerun with --create-new to create`);
        continue;
      }
      if (item.action === 'tombstone') {
        result.skipped++;
        opts.log(`  WARN tombstone not applied (Phase 2): ${item.relPath ?? item.arraId}`);
        continue;
      }

      if (opts.dryRun) {
        const rel = item.doc?.relPath ?? '?';
        opts.log(`  [dry-run] ${item.action}: ${rel}`);
        if (item.action === 'update') result.applied++;
        else if (item.action === 'create') result.created++;
        continue;
      }

      if (item.action === 'update' && item.doc) {
        await patchDoc(item.doc);
        result.applied++;
        if (opts.verbose) opts.log(`  updated: ${item.doc.relPath}`);
      } else if (item.action === 'create' && item.doc) {
        const id = await createDoc(item.doc);
        result.created++;
        if (opts.verbose) opts.log(`  created: ${item.doc.relPath} → ${id}`);
        // Stash the returned id on the doc so state-writer can record it.
        item.doc.meta.arra_id = id;
      }
    } catch (err) {
      result.failed++;
      const rel = item.doc?.relPath ?? item.relPath ?? '?';
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push({ relPath: rel, message: msg });
      opts.log(`  ERROR ${item.action}: ${rel} — ${msg}`);
    }
  }
  return result;
}

async function patchDoc(doc: ImportDoc): Promise<void> {
  const id = doc.meta.arra_id as string;
  const body = {
    content: composeContent(doc),
    concepts: doc.concepts,
    title: doc.title,
  };
  const res = await apiFetch(`/api/doc/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`PATCH /api/doc/${id} → HTTP ${res.status} ${text.slice(0, 200)}`);
  }
}

async function createDoc(doc: ImportDoc): Promise<string> {
  const body = {
    type: (doc.meta.arra_type as string | undefined) ?? 'learning',
    content: composeContent(doc),
    concepts: doc.concepts,
    source_file: `imported/${doc.relPath}`,
    project: doc.meta.arra_project as string | undefined,
  };
  const res = await apiFetch(`/api/doc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`POST /api/doc → HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { id?: string };
  if (!json.id) throw new Error(`POST /api/doc returned no id`);
  return json.id;
}

/** Title + body, normalised, with no double H1. */
export function composeContent(doc: ImportDoc): string {
  const body = doc.body.trim();
  return body ? `# ${doc.title}\n\n${body}\n` : `# ${doc.title}\n`;
}
