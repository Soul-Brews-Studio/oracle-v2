// neo-arra trace-chain <id> [--direction up|down|both]
// Calls: GET /api/traces/:id/chain?direction=...

import type { InvokeContext, InvokeResult } from "../../plugin/types.ts";
import { apiFetch } from "../../lib/api.ts";

export default async function handler(ctx: InvokeContext): Promise<InvokeResult> {
  const args = ctx.args;
  let id = "";
  let direction = "both";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--direction" && args[i + 1]) {
      direction = args[++i];
    } else if (!args[i].startsWith("--") && !id) {
      id = args[i];
    }
  }

  if (!id) {
    return { ok: false, error: "Usage: neo-arra trace-chain <id> [--direction up|down|both]" };
  }

  const params = new URLSearchParams({ direction });
  const res = await apiFetch(`/api/traces/${encodeURIComponent(id)}/chain?${params}`);

  if (res.status === 404) {
    return { ok: false, error: `Trace not found: ${id}` };
  }
  if (!res.ok) {
    return { ok: false, error: `Trace chain failed: HTTP ${res.status}` };
  }

  const data = await res.json() as any;
  const up: any[] = data.up ?? data.ancestors ?? [];
  const down: any[] = data.down ?? data.descendants ?? [];

  const lines: string[] = [`Chain for trace ${id} (direction: ${direction}):\n`];

  if (up.length > 0) {
    lines.push(`Upstream (${up.length}):`);
    for (const t of up) {
      lines.push(`  [${t.id}] ${t.query ?? t.title ?? ""}`);
    }
    lines.push("");
  }

  if (down.length > 0) {
    lines.push(`Downstream (${down.length}):`);
    for (const t of down) {
      lines.push(`  [${t.id}] ${t.query ?? t.title ?? ""}`);
    }
    lines.push("");
  }

  if (up.length === 0 && down.length === 0) {
    lines.push("(no linked traces)");
  }

  return { ok: true, output: lines.join("\n") };
}
