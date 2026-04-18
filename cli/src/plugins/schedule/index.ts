// neo-arra schedule [--date YYYY-MM-DD] [--from X] [--to Y] [--status S] [--limit N]
// Calls: GET /api/schedule?date=...&from=...&to=...&filter=...&status=...&limit=N

import type { InvokeContext, InvokeResult } from "../../plugin/types.ts";
import { apiFetch } from "../../lib/api.ts";

export default async function handler(ctx: InvokeContext): Promise<InvokeResult> {
  const args = ctx.args;
  const params = new URLSearchParams();

  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    const val = args[i + 1];
    if (!val) continue;
    if (flag === "--date") { params.set("date", val); i++; }
    else if (flag === "--from") { params.set("from", val); i++; }
    else if (flag === "--to") { params.set("to", val); i++; }
    else if (flag === "--filter") { params.set("filter", val); i++; }
    else if (flag === "--status") { params.set("status", val); i++; }
    else if (flag === "--limit") { params.set("limit", val); i++; }
  }

  const qs = params.toString();
  const res = await apiFetch(`/api/schedule${qs ? `?${qs}` : ""}`);

  if (!res.ok) {
    return { ok: false, error: `Schedule list failed: HTTP ${res.status}` };
  }

  const data = await res.json() as any;
  const events: any[] = data.events ?? data.results ?? data.schedule ?? [];

  if (events.length === 0) {
    return { ok: true, output: "No scheduled events" };
  }

  const total = data.total ?? events.length;
  const lines: string[] = [`${total} events (showing ${events.length}):\n`];

  for (const e of events) {
    const when = e.date ?? e.scheduledAt ?? e.scheduled_at ?? "";
    const title = e.title ?? e.description ?? e.content ?? "(no title)";
    const status = e.status ? ` [${e.status}]` : "";
    lines.push(`[${e.id}]${status} ${when} — ${title}`);
  }

  return { ok: true, output: lines.join("\n") };
}
