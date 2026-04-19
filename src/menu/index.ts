import frontend from './frontend.ts';
import type { MenuItem } from './types.ts';

export type { MenuItem };

export function getFrontendMenuItems(): MenuItem[] {
  return [...frontend];
}
