/**
 * Oracle Vault Handler
 *
 * Backs up ψ/ to a private GitHub repo with project-nested paths.
 * No manifest, no hashing — git is the diff engine.
 *
 * Local → Vault mapping:
 *   ψ/memory/learnings/file.md       → ψ/memory/learnings/{project}/file.md
 *   ψ/memory/retrospectives/2026/... → ψ/memory/retrospectives/{project}/2026/...
 *   ψ/inbox/handoff/file.md          → ψ/inbox/handoff/{project}/file.md
 *   ψ/memory/resonance/file.md       → ψ/memory/resonance/file.md  (universal)
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { eq } from 'drizzle-orm';
import { db, settings } from '../db/index.ts';
import { detectProject } from '../server/project-detect.ts';

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

// Categories that get project-nested in the vault
const PROJECT_CATEGORIES = [
  'ψ/memory/learnings/',
  'ψ/memory/retrospectives/',
  'ψ/inbox/handoff/',
];

// Universal categories — no project prefix
const UNIVERSAL_CATEGORIES = [
  'ψ/memory/resonance/',
];

/**
 * Map a local ψ/ relative path to its vault destination.
 * Project-nested categories get a project prefix inserted after the category dir.
 * Universal categories (resonance) stay flat.
 */
export function mapToVaultPath(relativePath: string, project: string | null): string {
  if (!project) return relativePath;

  for (const category of PROJECT_CATEGORIES) {
    if (relativePath.startsWith(category)) {
      const rest = relativePath.slice(category.length);
      return `${category}${project}/${rest}`;
    }
  }

  // Universal or unknown — keep as-is
  return relativePath;
}

/**
 * Reverse: map a vault path back to local ψ/ path.
 * Strips the project prefix from project-nested categories.
 */
export function mapFromVaultPath(vaultRelativePath: string, project: string): string | null {
  for (const category of PROJECT_CATEGORIES) {
    const prefix = `${category}${project}/`;
    if (vaultRelativePath.startsWith(prefix)) {
      const rest = vaultRelativePath.slice(prefix.length);
      return `${category}${rest}`;
    }
  }

  // Universal categories — keep as-is
  for (const category of UNIVERSAL_CATEGORIES) {
    if (vaultRelativePath.startsWith(category)) {
      return vaultRelativePath;
    }
  }

  return null; // Not a recognized path for this project
}

/**
 * Ensure markdown file has project: field in frontmatter.
 * If frontmatter exists but has no project:, inject it.
 * If no frontmatter, add one with just project:.
 * Returns modified content (or original if already has project).
 */
export function ensureFrontmatterProject(content: string, project: string): string {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1];
    // Already has project: field
    if (/^project:\s/m.test(frontmatter)) return content;

    // Inject project: after existing frontmatter fields
    const newFrontmatter = `${frontmatter}\nproject: ${project}`;
    return content.replace(frontmatterMatch[0], `---\n${newFrontmatter}\n---`);
  }

  // No frontmatter — add one
  return `---\nproject: ${project}\n---\n\n${content}`;
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
// Vault path resolution (shared across tools)
// ---------------------------------------------------------------------------

/**
 * Resolve the vault ψ/ root for shared use by oracle_learn, oracle_handoff, indexer, etc.
 * Returns the vault repo local path, or a setup hint if not configured.
 */
export function getVaultPsiRoot(): { path: string } | { needsInit: true; hint: string } {
  const repo = getSetting('vault_repo');
  if (!repo) {
    return {
      needsInit: true,
      hint: 'Run: oracle-vault init <owner/repo> to set up central knowledge vault.\nExample: oracle-vault init Soul-Brews-Studio/oracle-vault',
    };
  }
  try {
    return { path: resolveVaultPath(repo) };
  } catch {
    return {
      needsInit: true,
      hint: `Vault repo "${repo}" not found locally. Run: ghq get ${repo}`,
    };
  }
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
  project?: string | null;
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

  // Detect project for nested paths
  const project = detectProject(repoRoot)?.toLowerCase() ?? null;
  console.error(`[Vault] Project: ${project || '(universal)'}`);

  // 1. Walk ψ/ recursively (skip symlinks)
  const diskFiles = walkFiles(psiDir, repoRoot);

  // 2. Copy files to vault with project-nested paths
  const vaultDestPaths = new Set<string>();

  for (const { relativePath, fullPath } of diskFiles) {
    const vaultRelPath = mapToVaultPath(relativePath, project);
    vaultDestPaths.add(vaultRelPath);

    const dest = path.join(vaultPath, vaultRelPath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });

    // For .md files in project categories: ensure project frontmatter
    if (project && fullPath.endsWith('.md') && isProjectCategory(relativePath)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const tagged = ensureFrontmatterProject(content, project);
      fs.writeFileSync(dest, tagged);
    } else {
      fs.copyFileSync(fullPath, dest);
    }
  }

  // 3. Clean up: remove vault files for THIS project that no longer exist locally
  if (project) {
    for (const category of PROJECT_CATEGORIES) {
      const vaultCategoryDir = path.join(vaultPath, category, project);
      if (!fs.existsSync(vaultCategoryDir)) continue;

      const vaultFiles = walkFiles(vaultCategoryDir, vaultPath);
      for (const { relativePath: vaultRelPath, fullPath: vaultFullPath } of vaultFiles) {
        if (!vaultDestPaths.has(vaultRelPath)) {
          fs.unlinkSync(vaultFullPath);
          cleanEmptyDirs(path.dirname(vaultFullPath), path.join(vaultPath, 'ψ'));
        }
      }
    }
  }

  // Also clean universal categories
  for (const category of UNIVERSAL_CATEGORIES) {
    const vaultCategoryDir = path.join(vaultPath, category);
    if (!fs.existsSync(vaultCategoryDir)) continue;

    const vaultFiles = walkFiles(vaultCategoryDir, vaultPath);
    for (const { relativePath: vaultRelPath, fullPath: vaultFullPath } of vaultFiles) {
      if (!vaultDestPaths.has(vaultRelPath)) {
        fs.unlinkSync(vaultFullPath);
        cleanEmptyDirs(path.dirname(vaultFullPath), path.join(vaultPath, 'ψ'));
      }
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
    return { dryRun: true, added, modified, deleted, project };
  }

  // 6. Commit + push
  const now = new Date();
  const ts = now.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
  const parts: string[] = [];
  if (added) parts.push(`+${added}`);
  if (modified) parts.push(`~${modified}`);
  if (deleted) parts.push(`-${deleted}`);
  const summary = parts.length ? ` (${parts.join(', ')})` : '';
  const projectTag = project ? ` [${project}]` : '';

  execSync(`git commit -m "vault sync: ${ts}${summary}${projectTag}"`, {
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

  return { dryRun: false, added, modified, deleted, commitHash, project };
}

export interface PullResult {
  files: number;
  project: string;
}

export function pullVault(opts: {
  repoRoot: string;
}): PullResult {
  const { repoRoot } = opts;

  const repo = getSetting('vault_repo');
  if (!repo) throw new Error('Vault not initialized. Run vault:init first.');

  const vaultPath = resolveVaultPath(repo);
  const project = detectProject(repoRoot)?.toLowerCase() ?? null;
  if (!project) {
    throw new Error('Cannot detect project from repoRoot. Pull requires project context.');
  }

  // Pull latest from vault repo
  try {
    execSync('git pull', { cwd: vaultPath, stdio: 'pipe' });
  } catch {
    console.error('[Vault] git pull failed — continuing with local vault state');
  }

  let fileCount = 0;

  // Copy project-nested files from vault → local
  for (const category of PROJECT_CATEGORIES) {
    const vaultCategoryDir = path.join(vaultPath, category, project);
    if (!fs.existsSync(vaultCategoryDir)) continue;

    const vaultFiles = walkFiles(vaultCategoryDir, path.join(vaultPath, category, project));
    for (const { relativePath, fullPath: vaultFullPath } of vaultFiles) {
      const localDest = path.join(repoRoot, category, relativePath);
      fs.mkdirSync(path.dirname(localDest), { recursive: true });
      fs.copyFileSync(vaultFullPath, localDest);
      fileCount++;
    }
  }

  // Copy universal files (resonance) from vault → local
  for (const category of UNIVERSAL_CATEGORIES) {
    const vaultCategoryDir = path.join(vaultPath, category);
    if (!fs.existsSync(vaultCategoryDir)) continue;

    const vaultFiles = walkFiles(vaultCategoryDir, path.join(vaultPath, category));
    for (const { relativePath, fullPath: vaultFullPath } of vaultFiles) {
      // Skip .gitkeep
      if (relativePath === '.gitkeep') continue;
      const localDest = path.join(repoRoot, category, relativePath);
      fs.mkdirSync(path.dirname(localDest), { recursive: true });
      fs.copyFileSync(vaultFullPath, localDest);
      fileCount++;
    }
  }

  console.error(`[Vault] Pulled ${fileCount} files for ${project}`);
  return { files: fileCount, project };
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

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isProjectCategory(relativePath: string): boolean {
  return PROJECT_CATEGORIES.some((cat) => relativePath.startsWith(cat));
}
