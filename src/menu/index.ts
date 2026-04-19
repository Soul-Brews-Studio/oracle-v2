import frontend from './frontend.ts';
import type { MenuItem } from '../routes/menu/model.ts';

export type { MenuItem };

export function getFrontendMenuItems(): MenuItem[] {
  return [...frontend];
}
