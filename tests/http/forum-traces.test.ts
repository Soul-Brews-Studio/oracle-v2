// HTTP contract tests — forum, traces, schedule (14 endpoints).
//
// Spawns a dedicated server with an isolated ORACLE_DATA_DIR so this file is
// not affected by env mutations from other test files (e.g. files-plugins)
// or by a pre-existing dev server on the default port. Traces are seeded via
// raw SQLite against the same DB the spawned server uses.
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import type { Subprocess } from "bun";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

const PORT = 47790;
const BASE_URL = `http://localhost:${PORT}`;
const SERVER_CWD = import.meta.dir.replace(/\/tests\/http$/, "");

let serverProcess: Subprocess | null = null;
let tmpDir: string;
let dbPath: string;

async function ping(): Promise<boolean> {
  try { return (await fetch(`${BASE_URL}/api/health`)).ok; } catch { return false; }
}

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "forum-traces-"));
  dbPath = join(tmpDir, "oracle.db");
  serverProcess = Bun.spawn(["bun", "run", "src/server.ts"], {
    cwd: SERVER_CWD,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      ORACLE_CHROMA_TIMEOUT: "3000",
      ORACLE_DATA_DIR: tmpDir,
      ORACLE_DB_PATH: dbPath,
      ORACLE_REPO_ROOT: tmpDir,
      ORACLE_PORT: String(PORT),
    },
  });
  for (let i = 0; i < 30; i++) { if (await ping()) return; await Bun.sleep(500); }
  throw new Error("Server failed to start within 15s");
}, 30_000);

afterAll(() => {
  if (serverProcess) serverProcess.kill();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe("Forum routes", () => {
  let createdThreadId: number | null = null;

  test("POST /api/thread creates thread", async () => {
    const res = await fetch(`${BASE_URL}/api/thread`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: "contract-test seed message",
        title: "contract-test thread",
        role: "human",
      }),
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(typeof data.thread_id).toBe("number");
    createdThreadId = data.thread_id;
  }, 30_000);

  test("POST /api/thread without message returns 400", async () => {
    const res = await fetch(`${BASE_URL}/api/thread`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test("GET /api/thread/:id returns thread with messages", async () => {
    expect(createdThreadId).not.toBeNull();
    const res = await fetch(`${BASE_URL}/api/thread/${createdThreadId}`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.thread.id).toBe(createdThreadId);
    expect(Array.isArray(data.messages)).toBe(true);
    expect(data.messages.length).toBeGreaterThan(0);
  });

  test("GET /api/thread/:id with invalid id returns 400", async () => {
    const res = await fetch(`${BASE_URL}/api/thread/not-a-number`);
    expect(res.status).toBe(400);
  });

  test("GET /api/thread/:id with missing id returns 404", async () => {
    const res = await fetch(`${BASE_URL}/api/thread/99999999`);
    expect(res.status).toBe(404);
  });

  test("PATCH /api/thread/:id/status updates status", async () => {
    expect(createdThreadId).not.toBeNull();
    const res = await fetch(`${BASE_URL}/api/thread/${createdThreadId}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "archived" }),
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.status).toBe("archived");
  });

  test("GET /api/threads lists threads with count and pagination", async () => {
    const res = await fetch(`${BASE_URL}/api/threads?limit=5&offset=0`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(Array.isArray(data.threads)).toBe(true);
    expect(typeof data.total).toBe("number");
    expect(data.threads.length).toBeLessThanOrEqual(5);
  });

  test("GET /api/threads?status=archived filters", async () => {
    const res = await fetch(`${BASE_URL}/api/threads?status=archived`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.threads.some((t: any) => t.id === createdThreadId)).toBe(true);
  });
});

describe("Trace routes", () => {
  let traceA: string;
  let traceB: string;

  beforeAll(() => {
    traceA = randomUUID();
    traceB = randomUUID();
    const db = new Database(dbPath);
    try {
      const now = Date.now();
      const insert = db.prepare(`
        INSERT INTO trace_log (
          trace_id, query, query_type,
          found_files, found_commits, found_issues,
          found_retrospectives, found_learnings, found_resonance,
          file_count, commit_count, issue_count,
          depth, child_trace_ids,
          scope, agent_count, status,
          created_at, updated_at
        ) VALUES (?, ?, 'general', '[]', '[]', '[]', '[]', '[]', '[]', 0, 0, 0, 0, '[]', 'project', 1, 'raw', ?, ?)
      `);
      insert.run(traceA, "contract-test trace A", now, now);
      insert.run(traceB, "contract-test trace B", now, now);
    } finally {
      db.close();
    }
  });

  test("GET /api/traces lists traces", async () => {
    const res = await fetch(`${BASE_URL}/api/traces?limit=10`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(Array.isArray(data.traces)).toBe(true);
  });

  test("GET /api/traces/:id returns trace", async () => {
    const res = await fetch(`${BASE_URL}/api/traces/${traceA}`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.traceId).toBe(traceA);
  });

  test("GET /api/traces/:id missing returns 404", async () => {
    const res = await fetch(`${BASE_URL}/api/traces/nonexistent-id`);
    expect(res.status).toBe(404);
  });

  test("GET /api/traces/:id/chain returns chain object", async () => {
    const res = await fetch(`${BASE_URL}/api/traces/${traceA}/chain`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data).toHaveProperty("chain");
  });

  test("POST /api/traces/:prevId/link without body returns 400", async () => {
    const res = await fetch(`${BASE_URL}/api/traces/${traceA}/link`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test("POST /api/traces/:prevId/link links prev→next", async () => {
    const res = await fetch(`${BASE_URL}/api/traces/${traceA}/link`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nextId: traceB }),
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  test("GET /api/traces/:id/linked-chain returns both traces after link", async () => {
    const res = await fetch(`${BASE_URL}/api/traces/${traceA}/linked-chain`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(Array.isArray(data.chain)).toBe(true);
    expect(data.chain.length).toBe(2);
    const ids = data.chain.map((t: any) => t.traceId);
    expect(ids).toEqual([traceA, traceB]);
  });

  test("DELETE /api/traces/:id/link without direction returns 400", async () => {
    const res = await fetch(`${BASE_URL}/api/traces/${traceA}/link`, { method: "DELETE" });
    expect(res.status).toBe(400);
  });

  test("DELETE /api/traces/:id/link?direction=next unlinks and chain clears", async () => {
    const res = await fetch(`${BASE_URL}/api/traces/${traceA}/link?direction=next`, {
      method: "DELETE",
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.success).toBe(true);

    const chainRes = await fetch(`${BASE_URL}/api/traces/${traceA}/linked-chain`);
    const chainData = await chainRes.json();
    expect(chainData.chain.length).toBe(1);
    expect(chainData.chain[0].traceId).toBe(traceA);
  });
});

describe("Schedule routes", () => {
  let createdEventId: number | null = null;

  test("POST /api/schedule adds event", async () => {
    const res = await fetch(`${BASE_URL}/api/schedule`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        date: "2099-01-01",
        event: "contract-test event",
        time: "10:00",
      }),
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(typeof data.id).toBe("number");
    createdEventId = data.id;
  });

  test("GET /api/schedule lists events", async () => {
    const res = await fetch(`${BASE_URL}/api/schedule?status=all&limit=50`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(typeof data).toBe("object");
  });

  test("PATCH /api/schedule/:id updates status", async () => {
    expect(createdEventId).not.toBeNull();
    const res = await fetch(`${BASE_URL}/api/schedule/${createdEventId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.id).toBe(createdEventId);
  });

  test("GET /api/schedule/md returns markdown text", async () => {
    const res = await fetch(`${BASE_URL}/api/schedule/md`);
    expect([200, 404]).toContain(res.status);
    const text = await res.text();
    expect(typeof text).toBe("string");
  });
});
