import { sessionApiBase, sessionFetch } from "./session-api.ts";

function fmtTime(v: unknown): string {
  if (!v) return "—";
  const s = String(v);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toISOString().replace("T", " ").slice(0, 19);
}

export async function sessionList(_args: string[]): Promise<number> {
  let res: Response;
  try {
    res = await sessionFetch("/api/sessions");
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
  if (!res.ok) {
    console.error(`\x1b[31m✗\x1b[0m GET /api/sessions failed: HTTP ${res.status}`);
    if (res.status === 404) {
      console.error("  endpoint not found — requires red's backend PR merged first");
    }
    return 1;
  }

  const data = (await res.json()) as any;
  const sessions: any[] = data.sessions ?? data.results ?? (Array.isArray(data) ? data : []);

  if (sessions.length === 0) {
    console.log(`no sessions (${sessionApiBase()})`);
    return 0;
  }

  type Row = {
    id: string;
    oracle: string;
    lastSeen: string;
    threads: string;
    learnings: string;
    traces: string;
  };

  const rows: Row[] = sessions.map(s => ({
    id: String(s.id ?? s.session_id ?? s.sessionId ?? "—"),
    oracle: String(s.oracle ?? s.agent ?? "—"),
    lastSeen: fmtTime(s.last_seen ?? s.lastSeen ?? s.updated_at ?? s.ended_at),
    threads: String(s.threads_count ?? s.threads ?? s.counts?.threads ?? 0),
    learnings: String(s.learnings_count ?? s.learnings ?? s.counts?.learnings ?? 0),
    traces: String(s.traces_count ?? s.traces ?? s.counts?.traces ?? 0),
  }));

  const cols = [
    { key: "id", head: "SESSION_ID" },
    { key: "oracle", head: "ORACLE" },
    { key: "lastSeen", head: "LAST_SEEN" },
    { key: "threads", head: "#THREADS" },
    { key: "learnings", head: "#LEARNINGS" },
    { key: "traces", head: "#TRACES" },
  ] as const;

  const widths = cols.map(c =>
    Math.max(c.head.length, ...rows.map(r => (r[c.key as keyof Row] ?? "").length)),
  );

  const line = (vals: string[]) =>
    vals.map((v, i) => v.padEnd(widths[i])).join("  ").trimEnd();

  console.log(line(cols.map(c => c.head)));
  for (const r of rows) {
    console.log(line(cols.map(c => r[c.key as keyof Row])));
  }
  return 0;
}
