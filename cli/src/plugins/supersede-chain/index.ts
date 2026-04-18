// neo-arra supersede-chain <path>
// Calls: GET /api/supersede/chain/:path

import type { InvokeContext, InvokeResult } from "../../plugin/types.ts";
import { apiFetch } from "../../lib/api.ts";

export default async function handler(ctx: InvokeContext): Promise<InvokeResult> {
  const args = ctx.args;

  const docPath = args.find(a => !a.startsWith("--"));
  if (!docPath) {
    return { ok: false, error: "Usage: neo-arra supersede-chain <path>" };
  }

  const res = await apiFetch(`/api/supersede/chain/${encodeURIComponent(docPath)}`);

  if (!res.ok) {
    return { ok: false, error: `Chain lookup failed: HTTP ${res.status}` };
  }

  const data = await res.json() as any;
  const supersededBy: any[] = data.superseded_by ?? [];
  const supersedes: any[] = data.supersedes ?? [];

  const lines: string[] = [`Supersede chain for: ${docPath}\n`];

  if (supersededBy.length > 0) {
    lines.push(`Superseded by (${supersededBy.length}):`);
    for (const s of supersededBy) {
      lines.push(`  → ${s.new_path}`);
      if (s.reason) lines.push(`    reason: ${s.reason}`);
    }
    lines.push("");
  }

  if (supersedes.length > 0) {
    lines.push(`Supersedes (${supersedes.length}):`);
    for (const s of supersedes) {
      lines.push(`  ← ${s.old_path}`);
      if (s.reason) lines.push(`    reason: ${s.reason}`);
    }
    lines.push("");
  }

  if (supersededBy.length === 0 && supersedes.length === 0) {
    lines.push("(no supersession links)");
  }

  return { ok: true, output: lines.join("\n") };
}
