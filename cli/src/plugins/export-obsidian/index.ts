// arra-cli export-obsidian --out <path> [flags]
// Issue #933 — CLI: export ARRA → Obsidian vault.
//
// Pipeline (3 concerns, 3 agents):
//   weaver  (this file)          — arg parsing, orchestration, vault writer, slugify, shared types
//   threader (lib/fetch-*.ts)    — HTTP fetch + similarity batching
//   scribe  (lib/render-*.ts)    — markdown + frontmatter + index rendering
//
// The imports below reference files owned by threader and scribe. Until those
// PRs land, the @ts-expect-error pragmas keep the CLI subpackage typecheck-clean.
// Once both PRs merge, the pragmas can be removed in a follow-up commit.

import type { InvokeContext, InvokeResult } from "../../plugin/types.ts";
import type { ApiDoc, ExportOptions, SimilarResult, VaultFile } from "./lib/types.ts";
import { slugifyPath } from "./lib/slugify.ts";
import { writeVault } from "./lib/vault-writer.ts";
// @ts-expect-error — threader PR lands separately (issue #933)
import { fetchAllDocs } from "./lib/fetch-docs.ts";
// @ts-expect-error — threader PR lands separately (issue #933)
import { fetchSimilar } from "./lib/fetch-similar.ts";
// @ts-expect-error — scribe PR lands separately (issue #933)
import { renderDocMarkdown } from "./lib/render-body.ts";
// @ts-expect-error — scribe PR lands separately (issue #933)
import { renderIndex } from "./lib/render-index.ts";

export default async function handler(ctx: InvokeContext): Promise<InvokeResult> {
  let opts: ExportOptions;
  try {
    opts = parseArgs(ctx.args);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  // Fetch
  const docs: ApiDoc[] = await fetchAllDocs({
    types: opts.types,
    project: opts.project,
  });

  // Similarity edges per doc
  const similarByDoc = new Map<string, SimilarResult[]>();
  for (const doc of docs) {
    const neighbours: SimilarResult[] = await fetchSimilar(doc.id, {
      model: opts.model,
      threshold: opts.threshold,
      limit: opts.maxLinks,
    });
    similarByDoc.set(doc.id, neighbours);
  }

  // Render
  const files: VaultFile[] = [];
  for (const doc of docs) {
    const relPath = slugifyPath(doc.type, doc.id, doc.title ?? doc.id);
    const content: string = renderDocMarkdown(doc, similarByDoc.get(doc.id) ?? [], opts);
    files.push({ relPath, content });
  }

  const indexFiles: VaultFile[] = renderIndex(docs, similarByDoc, opts);
  files.push(...indexFiles);

  // Write
  const report = await writeVault(opts.out, files, {
    dryRun: opts.dryRun,
    incremental: opts.incremental,
  });

  const lines: string[] = [];
  lines.push(`Obsidian vault export → ${opts.out}`);
  lines.push(`  docs:       ${docs.length}`);
  lines.push(`  files:      ${files.length}`);
  lines.push(`  written:    ${report.written}`);
  lines.push(`  unchanged:  ${report.unchanged}`);
  lines.push(`  skipped:    ${report.skipped} (dry-run)`);
  if (report.errors.length > 0) {
    lines.push(`  errors:     ${report.errors.length}`);
    for (const e of report.errors.slice(0, 5)) lines.push(`    - ${e.relPath}: ${e.message}`);
  }

  const ok = report.errors.length === 0;
  return ok ? { ok, output: lines.join("\n") } : { ok, error: lines.join("\n") };
}

export function parseArgs(args: string[]): ExportOptions {
  const opts: ExportOptions = {
    out: "",
    model: "bge-m3",
    threshold: 0.75,
    maxLinks: 8,
    types: null,
    project: null,
    dryRun: false,
    incremental: false,
    format: "standard",
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = () => args[++i];
    if (a === "--out") opts.out = next() ?? "";
    else if (a === "--model") opts.model = (next() as ExportOptions["model"]) ?? "bge-m3";
    else if (a === "--threshold") opts.threshold = parseFloat(next() ?? "0.75") || 0.75;
    else if (a === "--max-links") opts.maxLinks = parseInt(next() ?? "8", 10) || 8;
    else if (a === "--types") opts.types = (next() ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--project") opts.project = next() ?? null;
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--incremental") opts.incremental = true;
    else if (a === "--format") opts.format = (next() as ExportOptions["format"]) ?? "standard";
  }

  if (!opts.out) {
    throw new Error("Usage: arra-cli export-obsidian --out <path> [flags]");
  }
  if (opts.threshold < 0 || opts.threshold > 1) {
    throw new Error("--threshold must be between 0.0 and 1.0");
  }
  return opts;
}
