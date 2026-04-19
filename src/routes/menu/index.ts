/**
 * Menu Routes (Elysia) — composes /api/menu.
 *
 * The endpoint reads navigation from the `menu_items` DB table (seeded at
 * boot from route `detail.menu` metadata by src/db/seeders/menu-seeder.ts).
 */

import { Elysia } from 'elysia';
import { createMenuEndpoint } from './menu.ts';
import { createCustomMenuRoutes } from './custom.ts';

export function createMenuRoutes() {
  return new Elysia({ prefix: '/api' })
    .use(createMenuEndpoint())
    .use(createCustomMenuRoutes());
}

export {
  buildMenuItems,
  menuItemsFromRoutes,
  readApiMenuItemsFromDb,
  API_TO_STUDIO,
} from './menu.ts';
export type { MenuItem, MenuResponse } from './model.ts';
