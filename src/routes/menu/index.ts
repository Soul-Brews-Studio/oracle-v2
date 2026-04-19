/**
 * Menu Routes (Elysia) — composes /api/menu.
 *
 * The menu endpoint reads swagger nav tags off the other modules' routes,
 * so it's built via a factory that accepts the sibling modules to inspect.
 */

import { Elysia } from 'elysia';
import { createMenuEndpoint } from './menu.ts';
import { createCustomMenuRoutes } from './custom.ts';

type HasRoutes = { routes: Array<{ path: string; hooks?: { detail?: unknown } }> };

export function createMenuRoutes(sources: HasRoutes[]) {
  return new Elysia({ prefix: '/api' })
    .use(createMenuEndpoint(sources))
    .use(createCustomMenuRoutes());
}

export { buildMenuItems, API_TO_STUDIO } from './menu.ts';
export type { MenuItem, MenuResponse } from './model.ts';
