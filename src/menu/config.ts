import type { MenuItem } from '../routes/menu/model.ts';
import { getSetting } from '../db/index.ts';
import { fetchGistMenu, invalidateGistCache } from './gist.ts';

export type MenuConfig = {
  items: MenuItem[];
  disable: Set<string>;
};

export type MenuSource = {
  url: string | null;
  hash: string | null;
  loaded_at: number | null;
  status: 'ok' | 'stale' | 'error' | 'none';
};

let sourceState: MenuSource = {
  url: null,
  hash: null,
  loaded_at: null,
  status: 'none',
};

export function getMenuSource(): MenuSource {
  return { ...sourceState };
}

function readEnvDisable(): string[] {
  const raw = process.env.ORACLE_NAV_DISABLE;
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function readDbDisable(): string[] {
  try {
    const value = getSetting('nav_disabled');
    if (!value) return [];
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p): p is string => typeof p === 'string');
  } catch {
    return [];
  }
}

export async function getMenuConfig(): Promise<MenuConfig> {
  const disable = new Set<string>();
  const items: MenuItem[] = [];

  for (const p of readEnvDisable()) disable.add(p);
  for (const p of readDbDisable()) disable.add(p);

  const gistUrl = process.env.ORACLE_MENU_GIST;
  if (!gistUrl) {
    sourceState = { url: null, hash: null, loaded_at: null, status: 'none' };
    return { items, disable };
  }

  const result = await fetchGistMenu(gistUrl);
  if (!result) {
    sourceState = {
      url: gistUrl,
      hash: null,
      loaded_at: sourceState.url === gistUrl ? sourceState.loaded_at : null,
      status: 'error',
    };
    return { items, disable };
  }

  if (Array.isArray(result.data.items)) items.push(...result.data.items);
  if (Array.isArray(result.data.disable)) {
    for (const p of result.data.disable) if (typeof p === 'string') disable.add(p);
  }

  sourceState = {
    url: gistUrl,
    hash: result.hash,
    loaded_at: result.loadedAt,
    status: result.stale ? 'stale' : 'ok',
  };

  return { items, disable };
}

export async function reloadMenuConfig(): Promise<MenuConfig> {
  const gistUrl = process.env.ORACLE_MENU_GIST;
  if (gistUrl) invalidateGistCache(gistUrl);
  return getMenuConfig();
}

export function _resetMenuSource(): void {
  sourceState = { url: null, hash: null, loaded_at: null, status: 'none' };
}
