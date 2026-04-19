// Per-concept hub page renderer — one file per top concept.
// Lives at `_concepts/<slug>.md` in the exported vault.
// Pure — no I/O.

import type { ApiDoc } from "./types.ts";

function describe(concept: string, n: number): string {
  const kind = n === 1 ? "doc" : "docs";
  return `Hub for the concept **${concept}** — ${n} ${kind} tagged with this concept across the ARRA knowledge base.`;
}

function sortDocs(docs: ApiDoc[]): ApiDoc[] {
  // Deterministic: by created_at desc, fall back to id.
  return [...docs].sort((a, b) => {
    const ac = a.created_at ?? "";
    const bc = b.created_at ?? "";
    if (ac !== bc) return ac < bc ? 1 : -1;
    return a.id.localeCompare(b.id);
  });
}

function docLabel(doc: ApiDoc): string {
  if (doc.source_file) {
    const base = doc.source_file.split("/").pop() ?? doc.source_file;
    const stripped = base.replace(/\.(md|markdown|txt)$/i, "");
    if (stripped.trim()) return stripped.trim();
  }
  const h1 = doc.content.match(/^#\s+(.+?)\s*$/m);
  if (h1 && h1[1].trim()) return h1[1].trim();
  return doc.id;
}

export function renderConceptHub(
  concept: string,
  docs: ApiDoc[],
  slugForId: (id: string) => string,
): string {
  const sorted = sortDocs(docs);
  const out: string[] = [];
  out.push(`# Concept: ${concept}`);
  out.push("");
  out.push(describe(concept, sorted.length));
  out.push("");
  out.push(`tags: #${concept}`);
  out.push("");
  out.push("## Docs");
  out.push("");
  if (sorted.length === 0) {
    out.push("_No docs yet._");
    out.push("");
  } else {
    for (const d of sorted) {
      out.push(`- [[${slugForId(d.id)}|${docLabel(d)}]]`);
    }
    out.push("");
  }
  return out.join("\n");
}
