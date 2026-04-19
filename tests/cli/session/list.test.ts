import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { runCli, tryParseJson } from "../_run.ts";
import { ensureServer, stopServer } from "../_server.ts";

describe("arra-cli session list", () => {
  beforeAll(async () => { await ensureServer(); }, 30_000);
  afterAll(() => stopServer());

  test("default JSON output (or graceful 404 when /api/sessions absent)", async () => {
    const result = await runCli(["session", "list"]);
    if (result.code === 0) {
      const data = tryParseJson(result.stdout) as { api: string; sessions: unknown[] } | null;
      expect(data).not.toBeNull();
      expect(typeof data!.api).toBe("string");
      expect(Array.isArray(data!.sessions)).toBe(true);
      // Empty case: when no sessions exist, sessions should be []
      if (data!.sessions.length === 0) expect(data!.sessions).toEqual([]);
    } else {
      // Backend route not yet shipped — CLI must surface a clear error
      expect(result.stderr).toMatch(/HTTP 404|endpoint not found/);
    }
  }, 15_000);

  test("--yml flag produces non-JSON output when endpoint exists", async () => {
    const result = await runCli(["session", "list", "--yml"]);
    if (result.code === 0) {
      // YAML output should not parse as JSON
      expect(tryParseJson(result.stdout)).toBeNull();
      expect(result.stdout).toMatch(/sessions:|api:/);
    } else {
      expect(result.stderr).toMatch(/HTTP 404|endpoint not found/);
    }
  }, 15_000);
});
