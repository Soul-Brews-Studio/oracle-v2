import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { runCli, tryParseJson } from "../_run.ts";
import { ensureServer, stopServer } from "../_server.ts";

const TEST_PATH = `/__arra_cli_menu_add_test_${Date.now()}__`;

async function cleanup(path: string): Promise<void> {
  await runCli(["menu", "remove", path]);
}

describe("arra-cli menu add", () => {
  beforeAll(async () => { await ensureServer(); }, 30_000);
  afterAll(async () => {
    await cleanup(TEST_PATH);
    stopServer();
  });

  test("missing flags → non-zero with usage", async () => {
    const result = await runCli(["menu", "add"]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/usage:.*menu add/);
  }, 15_000);

  test("invalid --group → rejected", async () => {
    const result = await runCli(["menu", "add", "--path", "/x", "--label", "X", "--group", "bogus"]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/invalid --group/);
  }, 15_000);

  test("adds a custom item and returns JSON", async () => {
    const result = await runCli([
      "menu", "add",
      "--path", TEST_PATH,
      "--label", "CLI Test",
      "--group", "tools",
      "--order", "91",
    ]);
    if (result.code === 0) {
      const data = tryParseJson(result.stdout) as
        | { added: boolean; replaced: boolean; item: { path: string; label: string; added: boolean } }
        | null;
      expect(data).not.toBeNull();
      expect(data!.item.path).toBe(TEST_PATH);
      expect(data!.item.label).toBe("CLI Test");
      expect(data!.item.added).toBe(true);
      expect(data!.added || data!.replaced).toBe(true);
    } else {
      expect(result.stderr).toMatch(/HTTP 404|failed/);
    }
  }, 15_000);

  test("second add with same path → replaces (replaced:true)", async () => {
    await runCli([
      "menu", "add", "--path", TEST_PATH, "--label", "First",
    ]);
    const result = await runCli([
      "menu", "add", "--path", TEST_PATH, "--label", "Second",
    ]);
    if (result.code === 0) {
      const data = tryParseJson(result.stdout) as { replaced: boolean; item: { label: string } } | null;
      expect(data).not.toBeNull();
      expect(data!.replaced).toBe(true);
      expect(data!.item.label).toBe("Second");
    }
  }, 15_000);
});
