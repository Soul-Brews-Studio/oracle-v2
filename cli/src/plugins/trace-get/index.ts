// neo-arra trace-get <id>
// Calls: GET /api/traces/:id

import type { InvokeContext, InvokeResult } from "../../plugin/types.ts";
import { apiFetch } from "../../lib/api.ts";

export default async function handler(ctx: InvokeContext): Promise<InvokeResult> {
  const args = ctx.args;
  const id = args.find((a) => !a.startsWith("--"));

  if (!id) {
    return { ok: false, error: "Usage: neo-arra trace-get <id>" };
  }

  const res = await apiFetch(`/api/traces/${encodeURIComponent(id)}`);

  if (res.status === 404) {
    return { ok: false, error: `Trace not found: ${id}` };
  }
  if (!res.ok) {
    return { ok: false, error: `Trace fetch failed: HTTP ${res.status}` };
  }

  const t = await res.json() as any;

  const lines: string[] = [
    `Trace [${t.id}]`,
    t.query ? `  query: ${t.query}` : "",
    t.title ? `  title: ${t.title}` : "",
    t.status ? `  status: ${t.status}` : "",
    t.project ? `  project: ${t.project}` : "",
  ].filter(Boolean);

  const when = t.created_at ?? t.createdAt;
  if (when) lines.push(`  created: ${new Date(when).toISOString().slice(0, 16).replace("T", " ")}`);

  if (t.content) {
    lines.push("", "Content:", t.content);
  } else if (t.summary) {
    lines.push("", "Summary:", t.summary);
  }

  return { ok: true, output: lines.join("\n") };
}
