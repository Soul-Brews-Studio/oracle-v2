/**
 * Menu seeder — syncs route-declared menu items into the `menu_items` table.
 *
 * Called at server boot (src/server.ts) and idempotent. For each route with
 * `detail.menu`, upserts by path:
 *   - Path not in DB           → INSERT with source='route', touchedAt=null
 *   - In DB, source='route'+untouched → UPDATE label/group/position from route
 *   - touchedAt != null        → PRESERVE (user edit wins); log drift
 */

import { eq } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import * as schema from '../schema.ts';
import { db as defaultDb } from '../index.ts';
import type { MenuMeta } from '../../routes/menu/model.ts';
import { API_TO_STUDIO } from '../../routes/menu/menu.ts';

export type RouteLike = { method?: string; path: string; hooks?: { detail?: unknown } };
export type HasRoutes = { routes: RouteLike[] };

export interface RouteMenuRow {
  path: string;        // studio path (e.g. /search)
  label: string;
  groupKey: string;
  position: number;
  access: string;
  icon?: string | null;
}

function studioPathFor(apiPath: string): string | null {
  for (const [prefix, studio] of API_TO_STUDIO) {
    if (apiPath === prefix || apiPath.startsWith(prefix + '/')) return studio;
  }
  return null;
}

export function collectRouteMenuRows(sources: HasRoutes[]): RouteMenuRow[] {
  const rows: RouteMenuRow[] = [];
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

      const slug = studio.replace(/^\//, '') || 'home';
      const label = menu.label ?? slug.charAt(0).toUpperCase() + slug.slice(1);
      const order =
        typeof menu.order === 'number' && Number.isFinite(menu.order) ? menu.order : 999;

      rows.push({
        path: studio,
        label,
        groupKey: menu.group,
        position: order,
        access: menu.access ?? 'public',
        icon: menu.icon ?? null,
      });
    }
  }

  return rows;
}

export interface SeedResult {
  inserted: number;
  updated: number;
  preserved: number;
}

export function seedMenuItems(
  sources: HasRoutes[],
  db: BunSQLiteDatabase<typeof schema> = defaultDb,
  now: Date = new Date(),
): SeedResult {
  const rows = collectRouteMenuRows(sources);
  let inserted = 0;
  let updated = 0;
  let preserved = 0;

  db.transaction((tx) => {
    for (const row of rows) {
      const existing = tx
        .select()
        .from(schema.menuItems)
        .where(eq(schema.menuItems.path, row.path))
        .get();

      if (!existing) {
        tx.insert(schema.menuItems)
          .values({
            path: row.path,
            label: row.label,
            groupKey: row.groupKey,
            position: row.position,
            access: row.access,
            source: 'route',
            icon: row.icon ?? null,
            enabled: true,
            touchedAt: null,
            createdAt: now,
            updatedAt: now,
          })
          .run();
        inserted += 1;
        continue;
      }

      if (existing.source === 'route' && existing.touchedAt == null) {
        const changed =
          existing.label !== row.label ||
          existing.groupKey !== row.groupKey ||
          existing.position !== row.position ||
          existing.access !== row.access ||
          existing.icon !== (row.icon ?? null);
        if (changed) {
          tx.update(schema.menuItems)
            .set({
              label: row.label,
              groupKey: row.groupKey,
              position: row.position,
              access: row.access,
              icon: row.icon ?? null,
              updatedAt: now,
            })
            .where(eq(schema.menuItems.id, existing.id))
            .run();
          updated += 1;
        }
        continue;
      }

      preserved += 1;
    }
  });

  return { inserted, updated, preserved };
}
