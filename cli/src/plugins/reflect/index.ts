// neo-arra reflect [--json]
// Calls: GET /api/reflect — returns a random wisdom fragment

import type { InvokeContext, InvokeResult } from "../../plugin/types.ts";
import { apiFetch } from "../../lib/api.ts";

export default async function handler(ctx: InvokeContext): Promise<InvokeResult> {
  const json = ctx.args.includes("--json");

  const res = await apiFetch("/api/reflect");
  if (!res.ok) {
    return { ok: false, error: `Reflect failed: HTTP ${res.status}` };
  }

  const data = await res.json() as Record<string, any>;

  if (json) {
    return { ok: true, output: JSON.stringify(data, null, 2) };
  }

  const lines: string[] = [];
  if (data.type) lines.push(`[${data.type}]${data.id ? ` ${data.id}` : ""}`);
  const content = data.content ?? data.text ?? data.message;
  if (content) lines.push(String(content).trim());
  if (data.source_file) lines.push(`  → ${data.source_file}`);

  if (lines.length === 0) {
    return { ok: true, output: JSON.stringify(data, null, 2) };
  }
  return { ok: true, output: lines.join("\n") };
}
