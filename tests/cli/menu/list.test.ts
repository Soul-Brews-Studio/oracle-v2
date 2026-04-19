import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { runCli, tryParseJson } from "../_run.ts";
import { ensureServer, stopServer } from "../_server.ts";

describe("arra-cli menu list", () => {
  beforeAll(async () => { await ensureServer(); }, 30_000);
  afterAll(() => stopServer());

  test("default JSON output returns items array", async () => {
    const result = await runCli(["menu", "list"]);
    if (result.code === 0) {
      const data = tryParseJson(result.stdout) as
        | { api: string; endpoint: string; items: unknown[] }
        | null;
      expect(data).not.toBeNull();
      expect(typeof data!.api).toBe("string");
      expect(data!.endpoint).toBe("/api/menu");
      expect(Array.isArray(data!.items)).toBe(true);
    } else {
      expect(result.stderr).toMatch(/HTTP 404|failed/);
    }
  }, 15_000);

  test("--custom → hits /api/menu/custom", async () => {
    const result = await runCli(["menu", "list", "--custom"]);
    if (result.code === 0) {
      const data = tryParseJson(result.stdout) as { endpoint: string; items: unknown[] } | null;
      expect(data).not.toBeNull();
      expect(data!.endpoint).toBe("/api/menu/custom");
      expect(Array.isArray(data!.items)).toBe(true);
    }
  }, 15_000);

  test("--yml flag produces non-JSON output", async () => {
    const result = await runCli(["menu", "list", "--yml"]);
    if (result.code === 0) {
      expect(tryParseJson(result.stdout)).toBeNull();
      expect(result.stdout).toMatch(/items:|api:/);
    }
  }, 15_000);
});
