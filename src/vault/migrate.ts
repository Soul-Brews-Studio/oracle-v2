/**
 * Oracle Vault Migration Tool
 *
 * Scans ghq repos for ψ/ directories and copies knowledge
 * to the central brain vault with project-nested paths.
 *
 * Usage:
 *   bun run vault:migrate              # scan + copy all ψ/ to vault
 *   bun run vault:migrate --dry-run    # preview what would be copied
 *   bun run vault:migrate --list       # just list repos with ψ/
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { eq } from 'drizzle-orm';
import { db, settings } from '../db/index.ts';
import { detectProject } from '../server/project-detect.ts';
import { mapToVaultPath, ensureFrontmatterProject } from './handler.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSetting(key: string): string | null {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  return row?.value ?? null;
}

function resolveVaultPath(repo: string): string {
  const output = execSync(`ghq list -p ${repo}`, { encoding: 'utf-8' }).trim();
  if (!output) throw new Error(`Vault repo "${repo}" not found via ghq.`);
  return output.split('\n')[0].trim();
}

function walkFiles(
  dir: string,
  baseDir: string,
): Array<{ relativePath: string; fullPath: string }> {
  const results: Array<{ relativePath: string; fullPath: string }> = [];
  if (!fs.existsSync(dir)) return results;

  for (const item of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, item);
    const stat = fs.lstatSync(fullPath);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) {
      results.push(...walkFiles(fullPath, baseDir));
    } else {
      results.push({ relativePath: path.relative(baseDir, fullPath), fullPath });
    }
  }
  return results;
}

// Categories that get project-nested
const PROJECT_CATEGORIES = [
  'ψ/memory/learnings/',
  'ψ/memory/retrospectives/',
  'ψ/inbox/handoff/',
];

function isProjectCategory(relativePath: string): boolean {
  return PROJECT_CATEGORIES.some((cat) => relativePath.startsWith(cat));
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

interface RepoInfo {
  repoPath: string;
  project: string;
  fileCount: number;
}

interface MigrateResult {
  reposFound: number;
  filesCopied: number;
  repos: RepoInfo[];
  skipped: string[];
}

/**
 * Find all ghq repos that have a ψ/ directory
 */
function findPsiRepos(): Array<{ repoPath: string; psiDir: string }> {
  try {
    execSync('ghq root', { encoding: 'utf-8' });
  } catch {
    throw new Error('ghq not found. Install ghq to use vault:migrate.');
  }

  const results: Array<{ repoPath: string; psiDir: string }> = [];

  // List all ghq repos and check for ψ/ in each
  const repos = execSync('ghq list -p', { encoding: 'utf-8' }).trim().split('\n');

  for (const repoPath of repos) {
    if (!repoPath) continue;
    const psiDir = path.join(repoPath, 'ψ');
    if (fs.existsSync(psiDir) && fs.statSync(psiDir).isDirectory()) {
      results.push({ repoPath, psiDir });
    }
  }

  return results;
}

/**
 * Migrate all ψ/ directories to the central vault
 */
function migrate(opts: { dryRun: boolean }): MigrateResult {
  const { dryRun } = opts;

  const repo = getSetting('vault_repo');
  if (!repo) throw new Error('Vault not initialized. Run vault:init first.');

  const vaultPath = resolveVaultPath(repo);
  const psiRepos = findPsiRepos();
  const result: MigrateResult = {
    reposFound: psiRepos.length,
    filesCopied: 0,
    repos: [],
    skipped: [],
  };

  // Skip the vault repo itself
  const vaultRealPath = fs.realpathSync(vaultPath);

  for (const { repoPath, psiDir } of psiRepos) {
    const repoRealPath = fs.realpathSync(repoPath);
    if (repoRealPath === vaultRealPath) {
      result.skipped.push(`${repoPath} (vault repo itself)`);
      continue;
    }

    const project = detectProject(repoPath)?.toLowerCase() ?? null;
    if (!project) {
      result.skipped.push(`${repoPath} (cannot detect project)`);
      continue;
    }

    const files = walkFiles(psiDir, repoPath);
    let fileCount = 0;

    for (const { relativePath, fullPath } of files) {
      // Skip .gitkeep files
      if (path.basename(relativePath) === '.gitkeep') continue;

      const vaultRelPath = mapToVaultPath(relativePath, project);
      const dest = path.join(vaultPath, vaultRelPath);

      if (!dryRun) {
        fs.mkdirSync(path.dirname(dest), { recursive: true });

        if (fullPath.endsWith('.md') && isProjectCategory(relativePath)) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const tagged = ensureFrontmatterProject(content, project);
          fs.writeFileSync(dest, tagged);
        } else {
          fs.copyFileSync(fullPath, dest);
        }
      }
      fileCount++;
    }

    result.repos.push({ repoPath, project, fileCount });
    result.filesCopied += fileCount;
  }

  // Git commit if not dry-run and there are changes
  if (!dryRun && result.filesCopied > 0) {
    try {
      execSync('git add -A', { cwd: vaultPath, stdio: 'pipe' });
      const status = execSync('git status --porcelain', {
        cwd: vaultPath,
        encoding: 'utf-8',
      }).trim();

      if (status) {
        const projectList = result.repos.map((r) => r.project).join(', ');
        execSync(
          `git commit -m "vault migrate: ${result.repos.length} repos (${result.filesCopied} files)\n\nProjects: ${projectList}"`,
          { cwd: vaultPath, stdio: 'pipe' },
        );
        execSync('git push', { cwd: vaultPath, stdio: 'pipe' });
        console.error(`[Vault] Migration committed and pushed`);
      }
    } catch (e) {
      console.error(`[Vault] Git commit/push failed:`, e instanceof Error ? e.message : e);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Exported API
// ---------------------------------------------------------------------------

export { findPsiRepos, migrate };
export type { MigrateResult, RepoInfo };

// ---------------------------------------------------------------------------
// CLI (when run directly)
// ---------------------------------------------------------------------------

if (import.meta.main) {
  const args = process.argv.slice(2);

  if (args.includes('--list')) {
    const repos = findPsiRepos();
    console.log(`Found ${repos.length} repos with ψ/ directories:\n`);
    for (const { repoPath } of repos) {
      const project = detectProject(repoPath)?.toLowerCase() ?? '(unknown)';
      const files = walkFiles(path.join(repoPath, 'ψ'), repoPath);
      console.log(`  ${project} (${files.length} files)`);
      console.log(`    ${repoPath}`);
    }
  } else {
    const dryRun = args.includes('--dry-run');
    if (dryRun) console.error('[Vault] DRY RUN — no files will be copied\n');

    const result = migrate({ dryRun });
    console.log(JSON.stringify(result, null, 2));
  }
}
