/**
 * GET /api/menu — aggregates navigation from swagger tags on mounted routes.
 *
 * Reads `nav:main` / `nav:tools` / `nav:hidden` + optional `order:N` from each
 * endpoint's `detail.tags`. Maps API prefixes to studio routes using
 * API_TO_STUDIO (kept in sync with oracle-studio's Header.tsx).
 */

import { Elysia, t } from 'elysia';
import { MenuItemSchema, MenuResponseSchema, type MenuItem } from './model.ts';
import { getFrontendMenuItems } from '../../menu/index.ts';
import { getMenuConfig, getMenuSource, reloadMenuConfig } from '../../menu/config.ts';
import { listCustomMenuItems } from '../../menu/custom-store.ts';

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

export function buildMenuItems(
  sources: HasRoutes[],
  extras?: MenuExtras,
  customItems: MenuItem[] = [],
): MenuItem[] {
  const items: MenuItem[] = [];
  const seen = new Set<string>();
  const disableSet = new Set<string>(extras?.disable ?? []);

  for (const src of sources) {
    for (const route of src.routes) {
      const detail = (route.hooks?.detail ?? {}) as {
        tags?: unknown;
        summary?: unknown;
      };
      const tags: string[] = Array.isArray(detail.tags)
        ? (detail.tags as unknown[]).filter((t): t is string => typeof t === 'string')
        : [];

      const group: MenuItem['group'] | null = tags.includes('nav:main')
        ? 'main'
        : tags.includes('nav:tools')
          ? 'tools'
          : tags.includes('nav:hidden')
            ? 'hidden'
            : null;
      if (!group) continue;

      const studio = studioPathFor(route.path);
      if (!studio) continue;

      const key = `${group}:${studio}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const orderTag = tags.find((t) => t.startsWith('order:'));
      const parsed = orderTag ? parseInt(orderTag.slice('order:'.length), 10) : NaN;
      const order = Number.isFinite(parsed) ? parsed : 999;

      const slug = studio.replace(/^\//, '') || 'home';
      const label = slug.charAt(0).toUpperCase() + slug.slice(1);

      items.push({ path: studio, label, group, order, source: 'api' });
    }
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

export function createMenuEndpoint(sources: HasRoutes[]) {
  return new Elysia()
    .get(
      '/menu',
      async () => {
        const { items, disable } = await getMenuConfig();
        return {
          items: buildMenuItems(sources, { items, disable }, listCustomMenuItems()),
        };
      },
      {
        detail: {
          tags: ['menu', 'nav:hidden'],
          summary: 'Aggregated studio navigation from swagger nav tags',
        },
      },
    )
    .get('/menu/source', () => getMenuSource(), {
      response: MenuSourceSchema,
      detail: {
        tags: ['menu', 'nav:hidden'],
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
          tags: ['menu', 'nav:hidden'],
          summary: 'Force refetch of gist menu source, bypassing cache',
        },
      },
    );
}

export { MenuItemSchema };
