import type { MenuItem } from '../routes/menu/model.ts';

export type GistMenu = {
  items?: MenuItem[];
  disable?: string[];
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; data: GistMenu | null }>();

const GIST_PAGE_RE = /^https?:\/\/gist\.github\.com\/([^/]+)\/([a-f0-9]+)(?:\/?.*)?$/i;

export function toRawGistUrl(url: string): string {
  const m = url.match(GIST_PAGE_RE);
  if (m) return `https://gist.githubusercontent.com/${m[1]}/${m[2]}/raw/`;
  return url;
}

export async function fetchGistMenu(url: string): Promise<GistMenu | null> {
  const rawUrl = toRawGistUrl(url);
  const cached = cache.get(rawUrl);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;

  try {
    const res = await fetch(rawUrl);
    if (!res.ok) {
      cache.set(rawUrl, { at: Date.now(), data: null });
      return null;
    }
    const data = (await res.json()) as GistMenu;
    cache.set(rawUrl, { at: Date.now(), data });
    return data;
  } catch {
    cache.set(rawUrl, { at: Date.now(), data: null });
    return null;
  }
}

export function _clearGistCache(): void {
  cache.clear();
}
