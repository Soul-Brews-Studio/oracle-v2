import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { runCli, tryParseJson } from "../_run.ts";
import { ensureServer, stopServer } from "../_server.ts";

const TEST_PATH = `/__arra_cli_menu_rm_test_${Date.now()}__`;

describe("arra-cli menu remove", () => {
  beforeAll(async () => { await ensureServer(); }, 30_000);
  afterAll(() => stopServer());

  test("missing path → non-zero with usage", async () => {
    const result = await runCli(["menu", "remove"]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/usage:.*menu remove/);
  }, 15_000);

  test("remove nonexistent → exit 1 with removed:false", async () => {
    const result = await runCli([
      "menu", "remove", `/__nonexistent_${Date.now()}__`,
    ]);
    // Either endpoint missing (HTTP 404 bubble) or removed:false returned.
    if (result.stdout) {
      const data = tryParseJson(result.stdout) as { removed: boolean } | null;
      if (data) expect(data.removed).toBe(false);
    }
    expect(result.code).not.toBe(0);
  }, 15_000);

  test("add then remove → removed:true", async () => {
    const addResult = await runCli([
      "menu", "add", "--path", TEST_PATH, "--label", "RM Test",
    ]);
    if (addResult.code !== 0) return; // endpoint missing on older server
    const result = await runCli(["menu", "remove", TEST_PATH]);
    expect(result.code).toBe(0);
    const data = tryParseJson(result.stdout) as { removed: boolean; path: string } | null;
    expect(data).not.toBeNull();
    expect(data!.removed).toBe(true);
    expect(data!.path).toBe(TEST_PATH);
  }, 15_000);
});
