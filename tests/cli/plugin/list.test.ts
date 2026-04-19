import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { runCli, tryParseJson } from "../_run.ts";

describe("arra-cli plugin list", () => {
  let fakeHome: string;

  beforeAll(() => {
    fakeHome = mkdtempSync(join(tmpdir(), "arra-cli-test-"));
  });

  afterAll(() => {
    if (fakeHome) rmSync(fakeHome, { recursive: true, force: true });
  });

  test("empty plugin dir → exit 0, plugins: []", async () => {
    const result = await runCli(["plugin", "list"], { HOME: fakeHome });
    expect(result.code).toBe(0);
    const data = tryParseJson(result.stdout) as { dir: string; plugins: unknown[] } | null;
    expect(data).not.toBeNull();
    expect(Array.isArray(data!.plugins)).toBe(true);
    expect(data!.plugins).toEqual([]);
    expect(data!.dir).toContain(".oracle/plugins");
  }, 15_000);

  test("--yml flag → YAML, not JSON", async () => {
    const result = await runCli(["plugin", "list", "--yml"], { HOME: fakeHome });
    expect(result.code).toBe(0);
    expect(tryParseJson(result.stdout)).toBeNull();
    expect(result.stdout).toMatch(/plugins:|dir:/);
  }, 15_000);
});
