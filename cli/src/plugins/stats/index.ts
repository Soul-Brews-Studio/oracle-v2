// neo-arra stats [--json]
// Calls: GET /api/stats

import type { InvokeContext, InvokeResult } from "../../plugin/types.ts";
import { apiFetch } from "../../lib/api.ts";

export default async function handler(ctx: InvokeContext): Promise<InvokeResult> {
  const json = ctx.args.includes("--json");

  const res = await apiFetch("/api/stats");
  if (!res.ok) {
    return { ok: false, error: `Stats failed: HTTP ${res.status}` };
  }

  const data = await res.json() as Record<string, any>;

  if (json) {
    return { ok: true, output: JSON.stringify(data, null, 2) };
  }

  const lines: string[] = ["ARRA Oracle Stats:\n"];
  const counts = data.counts ?? {};
  for (const [k, v] of Object.entries(counts)) {
    lines.push(`  ${k.padEnd(20)} ${v}`);
  }
  if (data.vector) {
    lines.push("");
    lines.push(`  vector.enabled       ${data.vector.enabled}`);
    lines.push(`  vector.count         ${data.vector.count}`);
    lines.push(`  vector.collection    ${data.vector.collection}`);
  }
  if (data.vault_repo) {
    lines.push("");
    lines.push(`  vault_repo           ${data.vault_repo}`);
  }
  for (const [k, v] of Object.entries(data)) {
    if (k === "counts" || k === "vector" || k === "vault_repo") continue;
    if (typeof v === "object") continue;
    lines.push(`  ${k.padEnd(20)} ${v}`);
  }

  return { ok: true, output: lines.join("\n") };
}
