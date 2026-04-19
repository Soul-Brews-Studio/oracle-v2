/**
 * GET /api/menu — returns studio navigation, seeded from `detail.menu` on
 * mounted routes and persisted in the `menu_items` table.
 *
 * Flow:
 *   1. Boot-time seeder (src/db/seeders/menu-seeder.ts) upserts route-declared
 *      items into DB, preserving user-edited rows (`touchedAt != null`).
 *   2. This endpoint reads `menu_items` via Drizzle, merges frontend pages,
 *      gist extras, and custom items — preserving /api/menu response shape.
 */

import { Elysia, t } from 'elysia';
import { asc } from 'drizzle-orm';
import { MenuItemSchema, MenuResponseSchema, type MenuItem, type MenuMeta } from './model.ts';
import { getFrontendMenuItems } from '../../menu/index.ts';
import { getMenuConfig, getMenuSource, reloadMenuConfig } from '../../menu/config.ts';
import { listCustomMenuItems } from '../../menu/custom-store.ts';
import { db, menuItems } from '../../db/index.ts';

export type MenuExtras = {
  items?: MenuItem[];
  disable?: Iterable<string>;
};

export const API_TO_STUDIO: ReadonlyArray<readonly [string, string]> = [
  ['/api/supersede', '/superseded'],
  ['/api/search', '/search'],
  ['/api/list', '/feed'],
  ['/api/reflect', '/playground'],
  ['/api/threads', '/forum'],
  ['/api/traces', '/traces'],
  ['/api/schedule', '/schedule'],
  ['/api/plugins', '/plugins'],
  ['/api/graph', '/map'],
  ['/api/map3d', '/map'],
  ['/api/map', '/map'],
  ['/api/context', '/evolution'],
  ['/api/stats', '/pulse'],
];

function studioPathFor(apiPath: string): string | null {
  for (const [prefix, studio] of API_TO_STUDIO) {
    if (apiPath === prefix || apiPath.startsWith(prefix + '/')) return studio;
  }
  return null;
}

type RouteLike = { method?: string; path: string; hooks?: { detail?: unknown } };
type HasRoutes = { routes: RouteLike[] };

const GROUP_RANK: Record<MenuItem['group'], number> = { main: 0, tools: 1, admin: 2, hidden: 3 };

/**
 * Pure scan of Elysia route sources into MenuItems (source='api').
 * Used by tests and exported for callers that need pre-DB scanning.
 */
export function menuItemsFromRoutes(sources: HasRoutes[]): MenuItem[] {
  const items: MenuItem[] = [];
  const seen = new Set<string>();

  for (const src of sources) {
    for (const route of src.routes) {
      const detail = (route.hooks?.detail ?? {}) as { menu?: MenuMeta };
      const menu = detail.menu;
      if (!menu || !menu.group) continue;

      const studio = studioPathFor(route.path);
      if (!studio) continue;

      const key = `${menu.group}:${studio}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const order =
        typeof menu.order === 'number' && Number.isFinite(menu.order) ? menu.order : 999;
      const slug = studio.replace(/^\//, '') || 'home';
      const label = menu.label ?? slug.charAt(0).toUpperCase() + slug.slice(1);

      items.push({ path: studio, label, group: menu.group, order, source: 'api' });
    }
  }

  return items;
}

/**
 * Read API-sourced menu items from the `menu_items` DB table.
 * Only enabled rows are returned. Source is always 'api' for studio consumers.
 */
export function readApiMenuItemsFromDb(): MenuItem[] {
  const rows = db
    .select()
    .from(menuItems)
    .orderBy(asc(menuItems.position))
    .all();

  const items: MenuItem[] = [];
  for (const row of rows) {
    if (row.enabled === false) continue;
    const group = (['main', 'tools', 'admin', 'hidden'] as const).includes(
      row.groupKey as MenuItem['group'],
    )
      ? (row.groupKey as MenuItem['group'])
      : 'hidden';
    const item: MenuItem = {
      path: row.path,
      label: row.label,
      group,
      order: row.position,
      source: 'api',
    };
    if (row.icon) item.icon = row.icon;
    if (row.access === 'public' || row.access === 'auth') item.access = row.access;
    items.push(item);
  }
  return items;
}

/**
 * Merge pre-resolved API items with frontend pages, gist extras, and custom
 * items into the final /api/menu response. First-seen wins on dedupe; disable
 * filters any path.
 */
export function buildMenuItems(
  apiItems: MenuItem[],
  extras?: MenuExtras,
  customItems: MenuItem[] = [],
): MenuItem[] {
  const items: MenuItem[] = [];
  const seen = new Set<string>();
  const disableSet = new Set<string>(extras?.disable ?? []);

  for (const item of apiItems) {
    const key = `${item.group}:${item.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }

  for (const item of getFrontendMenuItems()) {
    const key = `${item.group}:${item.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }

  if (extras?.items) {
    for (const item of extras.items) {
      const key = `${item.group}:${item.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
  }

  for (const item of customItems) {
    const key = `${item.group}:${item.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ ...item, added: true } as MenuItem);
  }

  const filtered = disableSet.size ? items.filter((i) => !disableSet.has(i.path)) : items;
  filtered.sort((a, b) => GROUP_RANK[a.group] - GROUP_RANK[b.group] || a.order - b.order);
  return filtered;
}

const MenuSourceSchema = t.Object({
  url: t.Nullable(t.String()),
  hash: t.Nullable(t.String()),
  loaded_at: t.Nullable(t.Number()),
  status: t.Union([
    t.Literal('ok'),
    t.Literal('stale'),
    t.Literal('error'),
    t.Literal('none'),
  ]),
});

export function createMenuEndpoint() {
  return new Elysia()
    .get(
      '/menu',
      async () => {
        const { items, disable } = await getMenuConfig();
        return {
          items: buildMenuItems(
            readApiMenuItemsFromDb(),
            { items, disable },
            listCustomMenuItems(),
          ),
        };
      },
      {
        detail: {
          tags: ['menu'],
          menu: { group: 'hidden' },
          summary: 'Aggregated studio navigation from menu_items table',
        },
      },
    )
    .get('/menu/source', () => getMenuSource(), {
      response: MenuSourceSchema,
      detail: {
        tags: ['menu'],
        menu: { group: 'hidden' },
        summary: 'Current gist source: url, revision hash, loaded_at, status',
      },
    })
    .post(
      '/menu/reload',
      async () => {
        await reloadMenuConfig();
        return getMenuSource();
      },
      {
        response: MenuSourceSchema,
        detail: {
          tags: ['menu'],
          menu: { group: 'hidden' },
          summary: 'Force refetch of gist menu source, bypassing cache',
        },
      },
    );
}

export { MenuItemSchema };
