import type { MenuItem } from './model.ts';

export function studioHref(item: Pick<MenuItem, 'path' | 'studio'>, currentHost: string): string {
  if (item.studio) {
    return `https://${item.studio}${item.path}?host=${encodeURIComponent(currentHost)}`;
  }
  return item.path;
}
