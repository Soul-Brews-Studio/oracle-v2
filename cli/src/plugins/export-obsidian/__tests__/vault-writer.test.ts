import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeVault } from "../lib/vault-writer.ts";
import type { VaultFile } from "../lib/types.ts";

let vault: string;

beforeEach(async () => {
  vault = await mkdtemp(join(tmpdir(), "vault-writer-test-"));
});

afterEach(async () => {
  await rm(vault, { recursive: true, force: true });
});

describe("writeVault", () => {
  test("writes files and creates nested directories", async () => {
    const files: VaultFile[] = [
      { relPath: "principles/a.md", content: "# A\n" },
      { relPath: "learnings/2026-04-19_b.md", content: "# B\n" },
    ];
    const report = await writeVault(vault, files);
    expect(report.written).toBe(2);
    expect(report.errors).toEqual([]);

    expect(await readFile(join(vault, "principles/a.md"), "utf8")).toBe("# A\n");
    expect(
      await readFile(join(vault, "learnings/2026-04-19_b.md"), "utf8"),
    ).toBe("# B\n");
  });

  test("dry-run writes nothing", async () => {
    const files: VaultFile[] = [{ relPath: "a.md", content: "hi" }];
    const report = await writeVault(vault, files, { dryRun: true });
    expect(report.written).toBe(0);
    expect(report.skipped).toBe(1);

    let exists = true;
    try {
      await stat(join(vault, "a.md"));
    } catch {
      exists = false;
    }
    expect(exists).toBe(false);
  });

  test("incremental skips unchanged files", async () => {
    const files: VaultFile[] = [{ relPath: "a.md", content: "same" }];
    const first = await writeVault(vault, files);
    expect(first.written).toBe(1);

    const second = await writeVault(vault, files, { incremental: true });
    expect(second.written).toBe(0);
    expect(second.unchanged).toBe(1);
  });

  test("incremental rewrites when content changes", async () => {
    const rel = "a.md";
    await writeVault(vault, [{ relPath: rel, content: "v1" }]);
    const report = await writeVault(
      vault,
      [{ relPath: rel, content: "v2" }],
      { incremental: true },
    );
    expect(report.written).toBe(1);
    expect(report.unchanged).toBe(0);
    expect(await readFile(join(vault, rel), "utf8")).toBe("v2");
  });

  test("refuses path traversal", async () => {
    const files: VaultFile[] = [
      { relPath: "../escape.md", content: "nope" },
    ];
    const report = await writeVault(vault, files);
    expect(report.written).toBe(0);
    expect(report.errors.length).toBe(1);
    expect(report.errors[0]!.message).toContain("empty relPath");
  });

  test("returns an error when vaultDir is empty", async () => {
    const report = await writeVault("", [{ relPath: "a.md", content: "x" }]);
    expect(report.written).toBe(0);
    expect(report.errors.length).toBeGreaterThan(0);
  });

  test("atomic: no stray .tmp files after successful write", async () => {
    await writeVault(vault, [{ relPath: "a.md", content: "hi" }]);
    const fs = await import("node:fs/promises");
    const entries = await fs.readdir(vault);
    for (const e of entries) expect(e.endsWith(".tmp")).toBe(false);
  });
});
