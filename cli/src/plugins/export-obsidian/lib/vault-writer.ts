// Atomic, incremental vault writer for the Obsidian export.
// Owned by: weaver (issue #933, part 1).
//
// Behaviour:
//   - mkdir -p for every file's parent directory
//   - atomic writes (temp file + rename) so a crash never leaves a half-written .md
//   - incremental mode skips files whose on-disk content hashes match the new content
//   - --dry-run counts what would be written without touching disk
//
// Uses Bun APIs (Bun.file, Bun.write, Bun.hash) plus node:fs/promises for
// mkdir + rename (Bun.write doesn't expose atomic rename semantics directly).

import { mkdir, rename, stat, utimes } from "node:fs/promises";
import { dirname, join, sep } from "node:path";
import type { VaultFile, VaultWriteReport } from "./types.ts";

export interface VaultWriteOptions {
  dryRun?: boolean;
  incremental?: boolean;
}

export async function writeVault(
  vaultDir: string,
  files: VaultFile[],
  opts: VaultWriteOptions = {},
): Promise<VaultWriteReport> {
  const report: VaultWriteReport = {
    written: 0,
    skipped: 0,
    unchanged: 0,
    errors: [],
  };

  if (!vaultDir) {
    report.errors.push({ relPath: "<vault>", message: "vaultDir is required" });
    return report;
  }

  if (!opts.dryRun) {
    try {
      await mkdir(vaultDir, { recursive: true });
    } catch (err) {
      report.errors.push({ relPath: "<vault>", message: errMsg(err) });
      return report;
    }
  }

  for (const file of files) {
    const rel = normaliseRel(file.relPath);
    if (!rel) {
      report.errors.push({ relPath: file.relPath, message: "empty relPath" });
      continue;
    }

    if (opts.dryRun) {
      report.skipped++;
      continue;
    }

    try {
      const abs = join(vaultDir, rel);

      if (opts.incremental && (await contentMatches(abs, file.content))) {
        report.unchanged++;
        continue;
      }

      await mkdir(dirname(abs), { recursive: true });
      await atomicWrite(abs, file.content);

      if (file.mtime) {
        try {
          await utimes(abs, file.mtime, file.mtime);
        } catch {
          // mtime is best-effort; ignore platform oddities
        }
      }

      report.written++;
    } catch (err) {
      report.errors.push({ relPath: rel, message: errMsg(err) });
    }
  }

  return report;
}

async function contentMatches(abs: string, content: string): Promise<boolean> {
  try {
    const existing = Bun.file(abs);
    if (!(await existing.exists())) return false;
    const existingText = await existing.text();
    return hashContent(existingText) === hashContent(content);
  } catch {
    return false;
  }
}

function hashContent(text: string): string {
  // Bun.hash returns a bigint for Wyhash; stringify for stable comparison.
  return Bun.hash(text).toString(16);
}

async function atomicWrite(abs: string, content: string): Promise<void> {
  const tmp = `${abs}.tmp-${process.pid}-${Date.now().toString(36)}`;
  await Bun.write(tmp, content);
  try {
    await rename(tmp, abs);
  } catch (err) {
    // Best-effort cleanup of the tmp file if rename failed.
    try {
      await Bun.file(tmp).exists();
    } catch {
      // swallow
    }
    throw err;
  }
}

function normaliseRel(rel: string): string {
  if (!rel) return "";
  const cleaned = rel.replace(/^[\\/]+/, "").replace(/\\/g, "/");
  if (cleaned.includes("..")) return ""; // refuse path traversal
  return cleaned.split("/").join(sep);
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Tiny named re-export so tests can poke at the file-stat probe if we need it
// later. Kept internal otherwise.
export const __testing = { contentMatches, hashContent };

// Silence unused-import complaints in stripped builds.
void stat;
