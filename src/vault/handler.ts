/**
 * Oracle Vault Handler
 *
 * Backs up ψ/ to a private GitHub repo as a 1:1 mirror.
 * No manifest, no hashing — git is the diff engine.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { eq } from 'drizzle-orm';
import { db, settings } from '../db/index.js';

// ---------------------------------------------------------------------------
// Settings helpers (same pattern as server.ts)
// ---------------------------------------------------------------------------

function getSetting(key: string): string | null {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  return row?.value ?? null;
}

function setSetting(key: string, value: string | null): void {
  db.insert(settings)
    .values({ key, value, updatedAt: Date.now() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: Date.now() },
    })
    .run();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Walk all files under dir, skipping symlinks.
 * Returns paths relative to baseDir.
 */
function walkFiles(
  dir: string,
  baseDir: string,
): Array<{ relativePath: string; fullPath: string }> {
  const results: Array<{ relativePath: string; fullPath: string }> = [];
  if (!fs.existsSync(dir)) return results;

  for (const item of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, item);
    const stat = fs.lstatSync(fullPath); // lstat: don't follow symlinks
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) {
      results.push(...walkFiles(fullPath, baseDir));
    } else {
      results.push({ relativePath: path.relative(baseDir, fullPath), fullPath });
    }
  }
  return results;
}

function resolveVaultPath(repo: string): string {
  try {
    const output = execSync(`ghq list -p ${repo}`, { encoding: 'utf-8' }).trim();
    if (!output) throw new Error('empty output');
    return output.split('\n')[0].trim();
  } catch {
    throw new Error(`Vault repo "${repo}" not found via ghq. Run vault:init first.`);
  }
}

function cleanEmptyDirs(dir: string, stopAt: string): void {
  if (dir === stopAt || !fs.existsSync(dir)) return;
  const items = fs.readdirSync(dir);
  if (items.length === 0) {
    fs.rmdirSync(dir);
    cleanEmptyDirs(path.dirname(dir), stopAt);
  }
}

// ---------------------------------------------------------------------------
// Git status parser (exported for testing)
// ---------------------------------------------------------------------------

export interface GitStatusCounts {
  added: number;
  modified: number;
  deleted: number;
}

export function parseGitStatus(porcelainOutput: string): GitStatusCounts {
  let added = 0;
  let modified = 0;
  let deleted = 0;

  if (!porcelainOutput.trim()) return { added, modified, deleted };

  for (const line of porcelainOutput.trim().split('\n')) {
    const code = line.substring(0, 2);
    if (code.includes('A') || code === '??') added++;
    else if (code.includes('D')) deleted++;
    else if (code.includes('M') || code.includes('R')) modified++;
  }

  return { added, modified, deleted };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface InitResult {
  repo: string;
  vaultPath: string;
  created: boolean;
}

export function initVault(repo: string): InitResult {
  // 1. ghq get the repo (clone if not present)
  let created = false;
  try {
    const existing = execSync(`ghq list -p ${repo}`, { encoding: 'utf-8' }).trim();
    if (!existing) throw new Error('not found');
  } catch {
    execSync(`ghq get ${repo}`, { encoding: 'utf-8', stdio: 'pipe' });
    created = true;
  }

  const vaultPath = resolveVaultPath(repo);

  // 2. Save settings
  setSetting('vault_repo', repo);
  setSetting('vault_enabled', 'true');

  console.error(`[Vault] Initialized: ${repo} → ${vaultPath}`);
  return { repo, vaultPath, created };
}

export interface SyncResult {
  dryRun: boolean;
  added: number;
  modified: number;
  deleted: number;
  commitHash?: string;
}

export function syncVault(opts: {
  dryRun?: boolean;
  repoRoot: string;
}): SyncResult {
  const { dryRun = false, repoRoot } = opts;

  const repo = getSetting('vault_repo');
  if (!repo) throw new Error('Vault not initialized. Run vault:init first.');

  const vaultPath = resolveVaultPath(repo);
  const psiDir = path.join(repoRoot, 'ψ');
  if (!fs.existsSync(psiDir)) {
    throw new Error(`ψ/ directory not found at ${psiDir}`);
  }

  // 1. Walk ψ/ recursively (skip symlinks)
  const diskFiles = walkFiles(psiDir, repoRoot);

  // 2. Copy ALL files to vault/ψ/ (overwrite, create dirs)
  for (const { relativePath, fullPath } of diskFiles) {
    const dest = path.join(vaultPath, relativePath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(fullPath, dest);
  }

  // 3. Walk vault/ψ/ → remove files no longer in ψ/
  const diskPaths = new Set(diskFiles.map((f) => f.relativePath));
  const vaultPsiDir = path.join(vaultPath, 'ψ');
  const vaultFiles = walkFiles(vaultPsiDir, vaultPath);

  for (const { relativePath, fullPath: vaultFullPath } of vaultFiles) {
    if (!diskPaths.has(relativePath)) {
      fs.unlinkSync(vaultFullPath);
      cleanEmptyDirs(path.dirname(vaultFullPath), vaultPsiDir);
    }
  }

  // 4. git add -A && git status --porcelain → parse counts
  execSync('git add -A', { cwd: vaultPath, stdio: 'pipe' });
  const status = execSync('git status --porcelain', {
    cwd: vaultPath,
    encoding: 'utf-8',
  }).trim();

  const { added, modified, deleted } = parseGitStatus(status);

  // 5. If dry-run or no changes: return counts, stop
  if (dryRun || !status) {
    return { dryRun: true, added, modified, deleted };
  }

  // 6. Commit + push
  const now = new Date();
  const ts = now.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
  const parts: string[] = [];
  if (added) parts.push(`+${added}`);
  if (modified) parts.push(`~${modified}`);
  if (deleted) parts.push(`-${deleted}`);
  const summary = parts.length ? ` (${parts.join(', ')})` : '';

  execSync(`git commit -m "vault sync: ${ts}${summary}"`, {
    cwd: vaultPath,
    stdio: 'pipe',
  });

  const commitHash = execSync('git rev-parse --short HEAD', {
    cwd: vaultPath,
    encoding: 'utf-8',
  }).trim();

  execSync('git push', { cwd: vaultPath, stdio: 'pipe' });

  // 7. Update settings
  setSetting('vault_last_sync', String(now.getTime()));

  console.error(
    `[Vault] Synced: +${added} ~${modified} -${deleted} (${commitHash})`,
  );

  return { dryRun: false, added, modified, deleted, commitHash };
}

export interface VaultStatusResult {
  enabled: boolean;
  repo: string | null;
  lastSync: string | null;
  vaultPath: string | null;
  pending?: {
    added: number;
    modified: number;
    deleted: number;
    total: number;
  };
}

export function vaultStatus(repoRoot: string): VaultStatusResult {
  const repo = getSetting('vault_repo');
  const enabled = getSetting('vault_enabled') === 'true';
  const lastSyncMs = getSetting('vault_last_sync');

  if (!repo || !enabled) {
    return { enabled: false, repo: null, lastSync: null, vaultPath: null };
  }

  let vaultPath: string | null = null;
  try {
    vaultPath = resolveVaultPath(repo);
  } catch {
    return {
      enabled: true,
      repo,
      lastSync: lastSyncMs ? new Date(Number(lastSyncMs)).toISOString() : null,
      vaultPath: null,
    };
  }

  // Run git status in vault dir to count pending changes
  let pending = { added: 0, modified: 0, deleted: 0, total: 0 };

  try {
    const status = execSync('git status --porcelain', {
      cwd: vaultPath,
      encoding: 'utf-8',
    }).trim();

    const counts = parseGitStatus(status);
    pending = { ...counts, total: counts.added + counts.modified + counts.deleted };
  } catch {
    // git status failed — vault dir may not be a git repo
  }

  return {
    enabled: true,
    repo,
    lastSync: lastSyncMs ? new Date(Number(lastSyncMs)).toISOString() : null,
    vaultPath,
    pending,
  };
}
