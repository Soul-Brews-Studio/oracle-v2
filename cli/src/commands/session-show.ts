import { sessionFetch } from "./session-api.ts";

function fmtTime(v: unknown): string {
  if (!v) return "—";
  const s = String(v);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toISOString().replace("T", " ").slice(0, 19);
}

function pickCount(s: any, ...keys: string[]): number {
  for (const k of keys) {
    const v = s?.[k] ?? s?.counts?.[k.replace(/_count$/, "")];
    if (typeof v === "number") return v;
  }
  return 0;
}

export async function sessionShow(args: string[]): Promise<number> {
  const id = args.find(a => !a.startsWith("-"));
  if (!id) {
    console.error("usage: arra-cli session show <id>");
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
  const session = data.session ?? data;

  const threads = data.threads ?? session.threads ?? [];
  const learnings = data.learnings ?? session.learnings ?? [];
  const traces = data.traces ?? session.traces ?? [];

  const threadsN = Array.isArray(threads) ? threads.length : pickCount(session, "threads_count", "threads");
  const learningsN = Array.isArray(learnings) ? learnings.length : pickCount(session, "learnings_count", "learnings");
  const tracesN = Array.isArray(traces) ? traces.length : pickCount(session, "traces_count", "traces");

  console.log(`session:   ${session.id ?? session.session_id ?? id}`);
  console.log(`oracle:    ${session.oracle ?? session.agent ?? "—"}`);
  console.log(`started:   ${fmtTime(session.started_at ?? session.startedAt ?? session.created_at)}`);
  console.log(`ended:     ${fmtTime(session.ended_at ?? session.endedAt ?? session.last_seen)}`);
  console.log("");
  console.log(`threads:   ${threadsN}`);
  console.log(`learnings: ${learningsN}`);
  console.log(`traces:    ${tracesN}`);
  return 0;
}
