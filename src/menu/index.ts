import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import frontend from './frontend.ts';
import type { MenuItem } from '../routes/menu/model.ts';

export type { MenuItem };

export async function loadMenuItemsFromDir(dir: string): Promise<MenuItem[]> {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    console.warn(
      `[menu] ORACLE_MENU_DIR=${dir} does not exist; falling back to bundled defaults`,
    );
    return [...frontend];
  }

  const entries = readdirSync(dir)
    .filter((name) => {
      const ext = extname(name).toLowerCase();
      return ext === '.ts' || ext === '.json';
    })
    .sort();

  const byPath = new Map<string, MenuItem>();
  for (const name of entries) {
    const full = join(dir, name);
    const ext = extname(name).toLowerCase();
    let loaded: unknown;
    try {
      if (ext === '.json') {
        loaded = JSON.parse(readFileSync(full, 'utf-8'));
      } else {
        const mod = await import(resolve(full));
        loaded = (mod as { default?: unknown }).default;
      }
    } catch (err) {
      console.warn(`[menu] failed to load ${full}:`, err);
      continue;
    }
    if (!Array.isArray(loaded)) {
      console.warn(`[menu] ${full} did not export an array; skipping`);
      continue;
    }
    for (const item of loaded as MenuItem[]) {
      byPath.set(item.path, item);
    }
  }

  return Array.from(byPath.values());
}

let cached: MenuItem[] = [...frontend];
const envDir = process.env.ORACLE_MENU_DIR;
if (envDir) {
  try {
    cached = await loadMenuItemsFromDir(envDir);
  } catch (err) {
    console.warn(`[menu] failed to load ORACLE_MENU_DIR=${envDir}:`, err);
  }
}

export function getFrontendMenuItems(): MenuItem[] {
  return [...cached];
}
