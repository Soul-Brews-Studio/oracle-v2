// neo-arra thread <id>
// Calls: GET /api/thread/:id

import type { InvokeContext, InvokeResult } from "../../plugin/types.ts";
import { apiFetch } from "../../lib/api.ts";

export default async function handler(ctx: InvokeContext): Promise<InvokeResult> {
  const args = ctx.args;
  const id = args.find((a) => !a.startsWith("--"));

  if (!id) {
    return { ok: false, error: "Usage: neo-arra thread <id>" };
  }

  const res = await apiFetch(`/api/thread/${encodeURIComponent(id)}`);

  if (res.status === 404) {
    return { ok: false, error: `Thread not found: ${id}` };
  }
  if (!res.ok) {
    return { ok: false, error: `Thread fetch failed: HTTP ${res.status}` };
  }

  const data = await res.json() as any;
  const thread = data.thread ?? {};
  const messages: any[] = data.messages ?? [];

  const lines: string[] = [
    `Thread [${thread.id}] ${thread.title ?? "(no title)"}`,
    `  status: ${thread.status ?? "?"}`,
  ];
  if (thread.created_at) lines.push(`  created: ${thread.created_at.slice(0, 16).replace("T", " ")}`);
  if (thread.issue_url) lines.push(`  issue: ${thread.issue_url}`);
  lines.push("", `Messages (${messages.length}):`, "");

  for (const m of messages) {
    const when = m.created_at ? m.created_at.slice(0, 16).replace("T", " ") : "";
    lines.push(`  [${m.id}] ${m.role}${m.author ? ` (${m.author})` : ""}  ${when}`);
    const preview = (m.content ?? "").slice(0, 200).replace(/\n/g, " ");
    lines.push(`    ${preview}`.trimEnd());
    lines.push("");
  }

  return { ok: true, output: lines.join("\n") };
}
