import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { runCli } from "../_run.ts";
import { ensureServer, stopServer } from "../_server.ts";

describe("arra-cli session show", () => {
  beforeAll(async () => { await ensureServer(); }, 30_000);
  afterAll(() => stopServer());

  test("missing id → usage error (exit 1)", async () => {
    const result = await runCli(["session", "show"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/usage/i);
  }, 10_000);

  test("invalid id → non-zero exit, stderr mentions not found / 404", async () => {
    const result = await runCli(["session", "show", "definitely-does-not-exist-xyz-123"]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/not found|HTTP 404/);
  }, 15_000);
});
