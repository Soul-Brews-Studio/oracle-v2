import type { MenuItem } from '../routes/menu/model.ts';
import { getSetting } from '../db/index.ts';
import { fetchGistMenu } from './gist.ts';

export type MenuConfig = {
  items: MenuItem[];
  disable: Set<string>;
};

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
  if (gistUrl) {
    const gist = await fetchGistMenu(gistUrl);
    if (gist) {
      if (Array.isArray(gist.items)) items.push(...gist.items);
      if (Array.isArray(gist.disable)) {
        for (const p of gist.disable) if (typeof p === 'string') disable.add(p);
      }
    }
  }

  return { items, disable };
}
