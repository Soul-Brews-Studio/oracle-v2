/**
 * Project Detection via ghq/symlink resolution
 *
 * Auto-detects project context from working directory by following
 * symlinks to ghq paths. No hardcoding or marker files needed.
 *
 * Algorithm:
 * 1. Resolve symlinks to get real path (fs.realpathSync)
 * 2. Match ghq pattern: [path]/github.com/owner/repo/[...]
 * 3. Extract project identifier
 *
 * Example:
 *   cwd: ~/Nat-s-Agents/incubated/headline-mono/src/
 *        -> (symlink resolves)
 *   real: ~/Code/github.com/laris-co/headline-mono/src/
 *        -> (regex match)
 *   project: "github.com/laris-co/headline-mono"
 */

import fs from 'fs';
import path from 'path';

/**
 * Detect project from working directory by following symlinks to ghq path
 * @param cwd - Current working directory (may be symlink)
 * @returns Project identifier (e.g., "github.com/owner/repo") or null if not detectable
 */
export function detectProject(cwd?: string): string | null {
  if (!cwd) return null;

  try {
    // 1. Resolve symlinks to get real path
    const realPath = fs.realpathSync(cwd);

    // 2. Match ghq pattern: */github.com/owner/repo/* or */gitlab.com/owner/repo/*
    // Supports: github.com, gitlab.com, bitbucket.org, etc.
    const match = realPath.match(/\/(github\.com|gitlab\.com|bitbucket\.org)\/([^/]+\/[^/]+)/);

    if (match) {
      const [, host, ownerRepo] = match;
      return `${host}/${ownerRepo}`.toLowerCase();
    }

    // 3. Fallback: check for ghq root pattern without known host
    // Pattern: ~/Code/*/owner/repo or similar
    const ghqMatch = realPath.match(/\/Code\/([^/]+\/[^/]+\/[^/]+)/);
    if (ghqMatch) {
      return ghqMatch[1].toLowerCase();
    }

    return null;
  } catch (e) {
    // Path doesn't exist or can't be resolved
    return null;
  }
}

/**
 * Detect project from a file path
 * @param filePath - Absolute file path
 * @returns Project identifier or null
 */
export function detectProjectFromFile(filePath: string): string | null {
  return detectProject(path.dirname(filePath));
}

/**
 * Check if a path is within a specific project
 * @param cwd - Current working directory
 * @param project - Project identifier to check against
 * @returns true if cwd is within the project
 */
export function isInProject(cwd: string, project: string): boolean {
  const detected = detectProject(cwd);
  return detected === project;
}
