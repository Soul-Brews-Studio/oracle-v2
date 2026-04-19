import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { runCli, tryParseJson } from "../_run.ts";
import { ensureServer, stopServer, BASE_URL } from "../_server.ts";

async function clearGist(): Promise<void> {
  await fetch(`${BASE_URL}/api/menu/source`, { method: "DELETE" });
}

describe("arra-cli menu gist-*", () => {
  beforeAll(async () => {
    await ensureServer();
  }, 30_000);
  afterAll(async () => {
    await clearGist();
    stopServer();
  });
  beforeEach(async () => {
    await clearGist();
  });

  test("gist-status returns source JSON (status:none initially)", async () => {
    const result = await runCli(["menu", "gist-status"]);
    expect(result.code).toBe(0);
    const data = tryParseJson(result.stdout) as { source: { status: string; url: string | null } } | null;
    expect(data).not.toBeNull();
    expect(data!.source.status).toBe("none");
    expect(data!.source.url).toBeNull();
  }, 15_000);

  test("gist-url without arg → usage error", async () => {
    const result = await runCli(["menu", "gist-url"]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/usage:.*gist-url/);
  }, 15_000);

  test("gist-url with invalid URL → HTTP 400", async () => {
    const result = await runCli(["menu", "gist-url", "https://example.com/not-a-gist"]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/HTTP 400|invalid gist URL/);
  }, 15_000);

  test("gist-url → gist-status → gist-clear round-trip", async () => {
    const url = "https://gist.github.com/natw/c11eabcd01";
    const setRes = await runCli(["menu", "gist-url", url]);
    expect(setRes.code).toBe(0);
    const setData = tryParseJson(setRes.stdout) as
      | { mode: string; source: { url: string | null } }
      | null;
    expect(setData?.mode).toBe("merge");
    expect(setData?.source.url).toBe(url);

    const statusRes = await runCli(["menu", "gist-status"]);
    expect(statusRes.code).toBe(0);
    const statusData = tryParseJson(statusRes.stdout) as { source: { url: string | null } } | null;
    expect(statusData?.source.url).toBe(url);

    const clearRes = await runCli(["menu", "gist-clear"]);
    expect(clearRes.code).toBe(0);
    const clearData = tryParseJson(clearRes.stdout) as
      | { cleared: boolean; source: { status: string; url: string | null } }
      | null;
    expect(clearData?.cleared).toBe(true);
    expect(clearData?.source.status).toBe("none");

    const statusAfter = await runCli(["menu", "gist-status"]);
    const statusAfterData = tryParseJson(statusAfter.stdout) as { source: { url: string | null } } | null;
    expect(statusAfterData?.source.url).toBeNull();
  }, 30_000);

  test("gist-url --override reports mode:override", async () => {
    const url = "https://gist.github.com/natw/0ff21da01";
    const res = await runCli(["menu", "gist-url", url, "--override"]);
    expect(res.code).toBe(0);
    const data = tryParseJson(res.stdout) as { mode: string; source: { url: string | null } } | null;
    expect(data?.mode).toBe("override");
    expect(data?.source.url).toBe(url);
  }, 15_000);

  test("reset-all --yes clears state", async () => {
    const res = await runCli(["menu", "reset-all", "--yes"]);
    expect(res.code).toBe(0);
    const data = tryParseJson(res.stdout) as
      | { clearedTouched: number; deletedCustom: number; source: { status: string } }
      | null;
    expect(data).not.toBeNull();
    expect(typeof data!.clearedTouched).toBe("number");
    expect(typeof data!.deletedCustom).toBe("number");
    expect(data!.source.status).toBe("none");
  }, 15_000);

  test("gist-reload returns source JSON", async () => {
    const result = await runCli(["menu", "gist-reload"]);
    expect(result.code).toBe(0);
    const data = tryParseJson(result.stdout) as
      | { reloaded: boolean; source: { status: string } }
      | null;
    expect(data?.reloaded).toBe(true);
    expect(data?.source.status).toBe("none");
  }, 15_000);
});
