import { sessionFetch } from "./session-api.ts";
import { emit } from "./_output.ts";

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

  emit({
    session: {
      id: session.id ?? session.session_id ?? id,
      oracle: session.oracle ?? session.agent ?? null,
      started_at: session.started_at ?? session.startedAt ?? session.created_at ?? null,
      ended_at: session.ended_at ?? session.endedAt ?? session.last_seen ?? null,
    },
    counts: {
      threads: threadsN,
      learnings: learningsN,
      traces: tracesN,
    },
  }, args);
  return 0;
}
