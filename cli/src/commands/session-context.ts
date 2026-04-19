import { sessionFetch } from "./session-api.ts";

function fmtTime(v: unknown): string {
  if (!v) return "—";
  const s = String(v);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toISOString().replace("T", " ").slice(0, 19);
}

function preview(s: unknown, n = 100): string {
  if (s == null) return "";
  return String(s).replace(/\s+/g, " ").slice(0, n);
}

function printSection(title: string, items: any[], previewKeys: string[]) {
  console.log(`\n── ${title} (${items.length}) ──`);
  if (items.length === 0) {
    console.log("  (none)");
    return;
  }
  for (const item of items) {
    const id = item.id ?? item.thread_id ?? item.trace_id ?? "—";
    const when = fmtTime(item.created_at ?? item.createdAt ?? item.updated_at ?? item.timestamp);
    const body = previewKeys.map(k => item[k]).find(v => v != null);
    console.log(`  [${id}] ${when}`);
    const p = preview(body);
    if (p) console.log(`    ${p}`);
  }
}

export async function sessionContext(args: string[]): Promise<number> {
  const json = args.includes("--json");
  const id = args.find(a => !a.startsWith("-"));
  if (!id) {
    console.error("usage: arra-cli session context <id> [--json]");
    return 1;
  }

  let res: Response;
  try {
    res = await sessionFetch(`/api/session/${encodeURIComponent(id)}/context`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
  if (!res.ok) {
    console.error(`\x1b[31m✗\x1b[0m session ${id}: HTTP ${res.status}`);
    if (res.status === 404) {
      console.error("  not found (or red's backend PR not yet merged)");
    }
    return 1;
  }

  const data = (await res.json()) as any;

  if (json) {
    console.log(JSON.stringify(data, null, 2));
    return 0;
  }

  const session = data.session ?? data;
  const threads: any[] = data.threads ?? session.threads ?? [];
  const learnings: any[] = data.learnings ?? session.learnings ?? [];
  const traces: any[] = data.traces ?? session.traces ?? [];

  console.log(`session:   ${session.id ?? session.session_id ?? id}`);
  console.log(`oracle:    ${session.oracle ?? session.agent ?? "—"}`);
  console.log(`started:   ${fmtTime(session.started_at ?? session.startedAt ?? session.created_at)}`);
  console.log(`ended:     ${fmtTime(session.ended_at ?? session.endedAt ?? session.last_seen)}`);

  printSection("threads", threads, ["title", "subject", "content", "preview"]);
  printSection("learnings", learnings, ["content", "pattern", "text", "preview"]);
  printSection("traces", traces, ["content", "message", "text", "preview"]);
  return 0;
}
