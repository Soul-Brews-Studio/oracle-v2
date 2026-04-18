// neo-arra trace-list [--query Q] [--status X] [--project P] [--limit N] [--offset N]
// Calls: GET /api/traces?query=&status=&project=&limit=&offset=

import type { InvokeContext, InvokeResult } from "../../plugin/types.ts";
import { apiFetch } from "../../lib/api.ts";

export default async function handler(ctx: InvokeContext): Promise<InvokeResult> {
  const args = ctx.args;

  let query = "";
  let status = "";
  let project = "";
  let limit = 50;
  let offset = 0;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--query" && args[i + 1]) query = args[++i];
    else if (args[i] === "--status" && args[i + 1]) status = args[++i];
    else if (args[i] === "--project" && args[i + 1]) project = args[++i];
    else if (args[i] === "--limit" && args[i + 1]) limit = parseInt(args[++i], 10) || 50;
    else if (args[i] === "--offset" && args[i + 1]) offset = parseInt(args[++i], 10) || 0;
  }

  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (query) params.set("query", query);
  if (status) params.set("status", status);
  if (project) params.set("project", project);

  const res = await apiFetch(`/api/traces?${params}`);

  if (!res.ok) {
    return { ok: false, error: `Trace list failed: HTTP ${res.status}` };
  }

  const data = await res.json() as any;
  const traces: any[] = data.traces ?? data.results ?? [];

  if (traces.length === 0) {
    return { ok: true, output: "No traces found" };
  }

  const total = data.total ?? traces.length;
  const lines: string[] = [`${total} traces (showing ${traces.length}):\n`];

  for (const t of traces) {
    lines.push(`[${t.id}] ${t.query ?? t.title ?? "(no query)"}`);
    if (t.status) lines.push(`  status: ${t.status}${t.project ? `  project: ${t.project}` : ""}`);
    const when = t.created_at ?? t.createdAt;
    if (when) lines.push(`  ${new Date(when).toISOString().slice(0, 16).replace("T", " ")}`);
    lines.push("");
  }

  return { ok: true, output: lines.join("\n") };
}
