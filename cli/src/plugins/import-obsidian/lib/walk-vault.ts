// Walk an Obsidian vault and yield .md file paths.
// Skips: _index.md, _concepts/** (those are export-generated hubs, not user content),
// and anything under .obsidian/ or node_modules/ or dot-directories.

import { readdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const SKIP_DIRS = new Set(['.obsidian', 'node_modules', '.git', '_concepts']);
const SKIP_FILES = new Set(['_index.md', '.arra-vault-state.json']);

export interface WalkEntry {
  absPath: string;
  relPath: string; // forward-slash
}

export async function walkVault(vaultDir: string): Promise<WalkEntry[]> {
  const out: WalkEntry[] = [];
  await walk(vaultDir, vaultDir, out);
  return out;
}

async function walk(root: string, dir: string, out: WalkEntry[]): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }

  for (const name of entries) {
    if (name.startsWith('.') && name !== '.arra-vault-state.json') continue;
    if (SKIP_DIRS.has(name)) continue;

    const abs = join(dir, name);
    let info;
    try {
      info = await stat(abs);
    } catch {
      continue;
    }

    if (info.isDirectory()) {
      await walk(root, abs, out);
      continue;
    }
    if (!info.isFile()) continue;
    if (!name.endsWith('.md')) continue;
    if (SKIP_FILES.has(name)) continue;

    const rel = relative(root, abs).split(sep).join('/');
    out.push({ absPath: abs, relPath: rel });
  }
}
