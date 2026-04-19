/**
 * Menu source persistence + apply modes.
 *
 * Gist URL is persisted in `settings.menu_gist_url` (Drizzle). Two apply modes:
 *   - merge    — gist items fill in; user edits preserved (default)
 *   - override — on top of merge, clears touchedAt on menu_items rows whose
 *                path matches a gist item, so the seeder re-applies route
 *                defaults on next boot (user label/group edits erased for
 *                those paths). The gist overlay then merges as usual.
 *
 * resetAllMenu: nuclear reset — clears touchedAt + enables all route rows,
 * deletes all custom rows, removes custom-menu.json. Use for "fresh start".
 */
import fs from 'fs';
import { eq, inArray } from 'drizzle-orm';
import { db, menuItems, setSetting } from '../db/index.ts';
import { fetchGistMenu, invalidateGistCache, parseGistUrl } from './gist.ts';
import { _resetMenuSource } from './config.ts';
import { CUSTOM_MENU_FILE } from './custom-store.ts';

export const MENU_GIST_SETTING_KEY = 'menu_gist_url';

export type ApplyMode = 'merge' | 'override';

export async function applyMenuGistUrl(url: string, mode: ApplyMode = 'merge'): Promise<void> {
  setSetting(MENU_GIST_SETTING_KEY, url);
  invalidateGistCache();
  _resetMenuSource();
  if (mode !== 'override') return;

  const result = await fetchGistMenu(url);
  const paths = (result?.data.items ?? [])
    .map((i) => (typeof i?.path === 'string' ? i.path : ''))
    .filter((p) => p.length > 0);
  if (!paths.length) return;

  const now = new Date();
  db.update(menuItems)
    .set({ touchedAt: null, enabled: true, updatedAt: now })
    .where(inArray(menuItems.path, paths))
    .run();
}

export function clearMenuGistUrl(): void {
  setSetting(MENU_GIST_SETTING_KEY, null);
  invalidateGistCache();
  _resetMenuSource();
}

export interface ResetAllResult {
  clearedTouched: number;
  deletedCustom: number;
}

export function resetAllMenu(): ResetAllResult {
  const now = new Date();
  const touchedRows = db
    .update(menuItems)
    .set({ touchedAt: null, enabled: true, updatedAt: now })
    .where(eq(menuItems.source, 'route'))
    .returning()
    .all();
  const customDeleted = db
    .delete(menuItems)
    .where(eq(menuItems.source, 'custom'))
    .returning()
    .all();
  try {
    if (fs.existsSync(CUSTOM_MENU_FILE)) fs.rmSync(CUSTOM_MENU_FILE);
  } catch {
    // best-effort cleanup — seed file may not exist on fresh installs
  }
  invalidateGistCache();
  _resetMenuSource();
  return {
    clearedTouched: touchedRows.length,
    deletedCustom: customDeleted.length,
  };
}

export function getOfficialGistUrl(): string | null {
  const raw = process.env.ORACLE_OFFICIAL_MENU_GIST;
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return parseGistUrl(trimmed) ? trimmed : null;
}
