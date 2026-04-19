// arra-cli export-obsidian --out <path> [flags]
// Issue #933 — CLI: export ARRA → Obsidian vault.
//
// Pipeline:
//   - fetchAllDocs (threader) → ApiDoc[]
//   - fetchSimilar per doc (threader) → similarity edges
//   - renderDocMarkdown per doc (scribe) → body .md
//   - renderIndex + renderConceptHub (scribe) → _index.md + _concepts/*.md
//   - writeVault (weaver) → atomic write with incremental hash skip

import type { InvokeContext, InvokeResult } from "../../plugin/types.ts";
import type {
  ApiDoc,
  ExportOptions,
  SimilarResult,
  VaultFile,
  VaultStats,
} from "./lib/types.ts";
import { slugify, slugifyPath } from "./lib/slugify.ts";
import { writeVault, writeStateFile } from "./lib/vault-writer.ts";
import { fetchAllDocs } from "./lib/fetch-docs.ts";
import { fetchSimilar } from "./lib/fetch-similar.ts";
import { renderDocMarkdown, deriveTitle } from "./lib/render-body.ts";
import { renderIndex } from "./lib/render-index.ts";
import { renderConceptHub } from "./lib/concept-hub.ts";
import { hashPayload } from "./lib/state-hash.ts";

export default async function handler(ctx: InvokeContext): Promise<InvokeResult> {
  let opts: ExportOptions;
  try {
    opts = parseArgs(ctx.args);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  console.error(`[fetch] listing docs (types=${opts.types?.join(",") ?? "all"}, project=${opts.project ?? "*"})...`);
  const docs: ApiDoc[] = await fetchAllDocs({
    types: opts.types ?? undefined,
    project: opts.project ?? undefined,
  });
  console.error(`[fetch] ${docs.length} docs`);

  // Build id → slug map (without trailing .md; wikilinks omit extension).
  const slugById = new Map<string, string>();
  for (const doc of docs) {
    const rel = slugifyPath(doc.type, doc.id, doc.title ?? doc.id);
    slugById.set(doc.id, rel.replace(/\.md$/, ""));
  }
  const slugForId = (id: string) => slugById.get(id) ?? id;

  // Similarity edges. Failure on one doc shouldn't abort the whole export.
  const similarByDoc = new Map<string, SimilarResult[]>();
  let similarErrors = 0;
  const progressEvery = Math.max(1, Math.floor(docs.length / 50));
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    try {
      const edges = await fetchSimilar(doc.id, {
        model: opts.model,
        threshold: opts.threshold,
        limit: opts.maxLinks,
      });
      similarByDoc.set(doc.id, edges);
    } catch (err) {
      similarErrors++;
      similarByDoc.set(doc.id, []);
      if (similarErrors <= 3) {
        console.error(`[skip similar] ${doc.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if ((i + 1) % progressEvery === 0 || i + 1 === docs.length) {
      const pct = Math.round(((i + 1) / docs.length) * 100);
      console.error(`[similar] ${i + 1}/${docs.length} (${pct}%) — errors=${similarErrors}`);
    }
  }

  const files: VaultFile[] = [];

  // Per-doc bodies. Skip docs with null/undefined content defensively.
  let renderSkipped = 0;
  for (const doc of docs) {
    const relPath = `${slugForId(doc.id)}.md`;
    try {
      const safeDoc = { ...doc, content: doc.content ?? "", concepts: doc.concepts ?? [] };
      const content = renderDocMarkdown(safeDoc, {
        similar: similarByDoc.get(doc.id) ?? [],
        slugForId,
        model: opts.model,
        threshold: opts.threshold,
      });
      files.push({ relPath, content });
    } catch (err) {
      renderSkipped++;
      if (renderSkipped <= 3) {
        console.error(`[skip render] ${doc.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // _index.md
  const stats = buildStats(docs, similarByDoc, slugForId);
  files.push({ relPath: "_index.md", content: renderIndex(stats) });

  // Per-concept hubs (top concepts only).
  const docsByConcept = groupByConcept(docs);
  for (const { name } of stats.topConcepts) {
    const related = docsByConcept.get(name) ?? [];
    if (related.length === 0) continue;
    files.push({
      relPath: `_concepts/${slugify(name)}.md`,
      content: renderConceptHub(name, related, slugForId),
    });
  }

  const report = await writeVault(opts.out, files, {
    dryRun: opts.dryRun,
    incremental: opts.incremental,
  });

  // Issue #938 — write .arra-vault-state.json so import-obsidian can diff.
  if (!opts.dryRun && report.errors.length === 0) {
    const stateDocs: Record<string, { relPath: string; contentHash: string }> = {};
    for (const doc of docs) {
      const relPath = `${slugForId(doc.id)}.md`;
      const title = deriveTitle(doc);
      const hash = hashPayload(title, doc.content, doc.concepts ?? []);
      stateDocs[doc.id] = { relPath, contentHash: hash };
    }
    await writeStateFile(opts.out, {
      version: 1,
      last_export: new Date().toISOString(),
      model: opts.model,
      threshold: opts.threshold,
      docs: stateDocs,
    });
  }

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

function buildStats(
  docs: ApiDoc[],
  similar: Map<string, SimilarResult[]>,
  slugForId: (id: string) => string,
): VaultStats {
  const byType: Record<string, number> = {};
  const byProject: Record<string, number> = {};
  const conceptCount: Record<string, number> = {};
  for (const d of docs) {
    byType[d.type] = (byType[d.type] ?? 0) + 1;
    if (d.project) byProject[d.project] = (byProject[d.project] ?? 0) + 1;
    for (const c of d.concepts ?? []) conceptCount[c] = (conceptCount[c] ?? 0) + 1;
  }

  const topConcepts = Object.entries(conceptCount)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 30)
    .map(([name, count]) => ({ name, count }));

  const topLinked = docs
    .map((d) => ({
      slug: slugForId(d.id),
      linkCount: (similar.get(d.id) ?? []).length,
    }))
    .filter((x) => x.linkCount > 0)
    .sort((a, b) => b.linkCount - a.linkCount)
    .slice(0, 20);

  return {
    total: docs.length,
    byType,
    byProject,
    topConcepts,
    topLinked,
    generatedAt: new Date(),
  };
}

function groupByConcept(docs: ApiDoc[]): Map<string, ApiDoc[]> {
  const out = new Map<string, ApiDoc[]>();
  for (const d of docs) {
    for (const c of d.concepts ?? []) {
      if (!out.has(c)) out.set(c, []);
      out.get(c)!.push(d);
    }
  }
  return out;
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
