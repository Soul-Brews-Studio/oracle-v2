// neo-arra threads [--status X] [--limit N] [--offset N]
// Calls: GET /api/threads?status=X&limit=N&offset=N

import type { InvokeContext, InvokeResult } from "../../plugin/types.ts";
import { apiFetch } from "../../lib/api.ts";

export default async function handler(ctx: InvokeContext): Promise<InvokeResult> {
  const args = ctx.args;

  let status = "";
  let limit = 20;
  let offset = 0;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--status" && args[i + 1]) {
      status = args[++i];
    } else if (args[i] === "--limit" && args[i + 1]) {
      limit = parseInt(args[++i], 10) || 20;
    } else if (args[i] === "--offset" && args[i + 1]) {
      offset = parseInt(args[++i], 10) || 0;
    }
  }

  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (status) params.set("status", status);

  const res = await apiFetch(`/api/threads?${params}`);

  if (!res.ok) {
    return { ok: false, error: `Threads list failed: HTTP ${res.status}` };
  }

  const data = await res.json() as any;
  const threads: any[] = data.threads ?? [];

  if (threads.length === 0) {
    return { ok: true, output: status ? `No threads with status "${status}"` : "No threads found" };
  }

  const total = data.total ?? threads.length;
  const lines: string[] = [`${total} threads (showing ${threads.length}):\n`];

  for (const t of threads) {
    lines.push(`[${t.id}] ${t.title ?? "(no title)"}`);
    if (t.status) lines.push(`  status: ${t.status}  messages: ${t.message_count ?? 0}`);
    if (t.created_at) lines.push(`  ${t.created_at.slice(0, 16).replace("T", " ")}`);
    if (t.issue_url) lines.push(`  → ${t.issue_url}`);
    lines.push("");
  }

  return { ok: true, output: lines.join("\n") };
}
