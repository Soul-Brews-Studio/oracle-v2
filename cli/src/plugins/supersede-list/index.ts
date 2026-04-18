// neo-arra supersede-list [--project X] [--limit N] [--offset N]
// Calls: GET /api/supersede?project=X&limit=N&offset=N

import type { InvokeContext, InvokeResult } from "../../plugin/types.ts";
import { apiFetch } from "../../lib/api.ts";

export default async function handler(ctx: InvokeContext): Promise<InvokeResult> {
  const args = ctx.args;

  let project = "";
  let limit = 50;
  let offset = 0;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--project" && args[i + 1]) {
      project = args[++i];
    } else if (args[i] === "--limit" && args[i + 1]) {
      limit = parseInt(args[++i], 10) || 50;
    } else if (args[i] === "--offset" && args[i + 1]) {
      offset = parseInt(args[++i], 10) || 0;
    }
  }

  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (project) params.set("project", project);

  const res = await apiFetch(`/api/supersede?${params}`);

  if (!res.ok) {
    return { ok: false, error: `Supersede list failed: HTTP ${res.status}` };
  }

  const data = await res.json() as any;
  const logs: any[] = data.supersessions ?? [];

  if (logs.length === 0) {
    const label = project ? ` (project: ${project})` : "";
    return { ok: true, output: `No supersessions found${label}` };
  }

  const total = data.total ?? logs.length;
  const lines: string[] = [`${total} supersessions (showing ${logs.length}):\n`];

  for (const log of logs) {
    lines.push(`[${log.id}] ${log.old_path} → ${log.new_path ?? "(none)"}`);
    if (log.reason) lines.push(`  reason: ${log.reason}`);
    if (log.superseded_at) lines.push(`  ${log.superseded_at.slice(0, 16).replace("T", " ")}`);
    lines.push("");
  }

  return { ok: true, output: lines.join("\n") };
}
