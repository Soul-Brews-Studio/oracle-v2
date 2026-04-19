import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { runCli, tryParseJson } from "../_run.ts";

describe("arra-cli plugin info", () => {
  let fakeHome: string;

  beforeAll(() => {
    fakeHome = mkdtempSync(join(tmpdir(), "arra-cli-test-"));
    // Seed one valid plugin dir so the happy-path assertion has something to read.
    const pluginDir = join(fakeHome, ".oracle", "plugins", "demo");
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(
      join(pluginDir, "plugin.json"),
      JSON.stringify({ name: "demo", version: "0.1.0" }),
    );
  });

  afterAll(() => {
    if (fakeHome) rmSync(fakeHome, { recursive: true, force: true });
  });

  test("missing name → usage error", async () => {
    const result = await runCli(["plugin", "info"], { HOME: fakeHome });
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/usage/i);
  }, 10_000);

  test("unknown plugin → exit 1, stderr 'not found'", async () => {
    const result = await runCli(["plugin", "info", "no-such-plugin"], { HOME: fakeHome });
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/not found/);
  }, 10_000);

  test("known plugin → exit 0 with manifest in JSON", async () => {
    const result = await runCli(["plugin", "info", "demo"], { HOME: fakeHome });
    expect(result.code).toBe(0);
    const data = tryParseJson(result.stdout) as
      | { name: string; manifest: { name: string; version: string } | null }
      | null;
    expect(data).not.toBeNull();
    expect(data!.name).toBe("demo");
    expect(data!.manifest?.version).toBe("0.1.0");
  }, 15_000);
});
