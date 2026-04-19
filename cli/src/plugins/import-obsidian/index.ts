// arra-cli import-obsidian --in <path> [flags]
// Issue #938 — round-trip: pull edited vault files back into ARRA.

import type { InvokeContext, InvokeResult } from '../../plugin/types.ts';
import type { ImportDoc, ImportOptions } from './lib/types.ts';
import { walkVault } from './lib/walk-vault.ts';
import { parseVaultFile } from './lib/parse-body.ts';
import { loadState, buildPlan } from './lib/diff-state.ts';
import { applyPlan } from './lib/apply-changes.ts';
import { buildUpdatedState, writeState } from './lib/state-writer.ts';

export default async function handler(ctx: InvokeContext): Promise<InvokeResult> {
  let opts: ImportOptions;
  try {
    opts = parseArgs(ctx.args);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const lines: string[] = [];
  const log = (s: string) => lines.push(s);

  log(`Obsidian vault import ← ${opts.in}`);

  const entries = await walkVault(opts.in);
  const docs: ImportDoc[] = [];
  for (const entry of entries) {
    try {
      docs.push(await parseVaultFile(entry.absPath, entry.relPath));
    } catch (err) {
      log(`  WARN parse: ${entry.relPath} — ${errMsg(err)}`);
    }
  }

  const state = await loadState(opts.in);
  const plan = buildPlan(docs, state, {
    onlyChanged: opts.onlyChanged,
    createNew: opts.createNew,
    deleteMissing: opts.deleteMissing,
    types: opts.types,
  });

  log(`  scanned:    ${docs.length}`);
  log(`  changed:    ${plan.summary.changed}`);
  log(`  create:     ${plan.summary.created}`);
  log(`  unchanged:  ${plan.summary.unchanged}`);
  log(`  skip-no-id: ${plan.summary.skippedNoId}`);
  if (plan.summary.tombstoned > 0) log(`  tombstone:  ${plan.summary.tombstoned}`);
  if (opts.dryRun) log(`  (dry-run — no writes)`);

  const result = await applyPlan(plan, { dryRun: opts.dryRun, verbose: opts.verbose, log });

  log(`  applied:    ${result.applied}`);
  if (result.created > 0) log(`  created:    ${result.created}`);
  if (result.skipped > 0) log(`  skipped:    ${result.skipped}`);
  if (result.failed > 0) log(`  failed:     ${result.failed}`);

  if (!opts.dryRun && result.failed === 0) {
    const touched = plan.items
      .filter((i) => (i.action === 'update' || i.action === 'create') && i.doc)
      .map((i) => i.doc!) as ImportDoc[];
    const next = buildUpdatedState(state, touched, { model: state?.model, threshold: state?.threshold });
    try {
      await writeState(opts.in, next);
      log(`  state:      .arra-vault-state.json updated`);
    } catch (err) {
      log(`  WARN state-write: ${errMsg(err)}`);
    }
  }

  const ok = result.failed === 0;
  return ok ? { ok, output: lines.join('\n') } : { ok, error: lines.join('\n') };
}

export function parseArgs(args: string[]): ImportOptions {
  const opts: ImportOptions = {
    in: '',
    dryRun: false,
    onlyChanged: true,
    types: null,
    createNew: false,
    deleteMissing: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = () => args[++i];
    if (a === '--in') opts.in = next() ?? '';
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--only-changed') opts.onlyChanged = true;
    else if (a === '--all') opts.onlyChanged = false;
    else if (a === '--types') {
      opts.types = (next() ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    } else if (a === '--create-new') opts.createNew = true;
    else if (a === '--delete-missing') opts.deleteMissing = true;
    else if (a === '--verbose') opts.verbose = true;
  }

  if (!opts.in) {
    throw new Error('Usage: arra-cli import-obsidian --in <path> [flags]');
  }
  return opts;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
