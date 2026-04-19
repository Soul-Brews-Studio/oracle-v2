/**
 * Menu source admin endpoints — write side.
 *
 *   POST   /api/menu/source           body {url, mode?} set gist URL
 *   DELETE /api/menu/source           clear gist URL
 *   POST   /api/menu/reset-all        nuclear reset (clear touchedAt, drop custom)
 *   GET    /api/menu/source/official  returns ORACLE_OFFICIAL_MENU_GIST URL
 *
 * mode: 'merge' (default) preserves user edits; 'override' clears touchedAt on
 * rows whose path matches a gist item so the boot seeder re-applies route
 * defaults. Persistence via Drizzle settings (see src/menu/source-store.ts).
 */
import { Elysia, t } from 'elysia';
import { parseGistUrl } from '../../menu/gist.ts';
import {
  applyMenuGistUrl,
  clearMenuGistUrl,
  resetAllMenu,
  getOfficialGistUrl,
} from '../../menu/source-store.ts';
import { getMenuSource, reloadMenuConfig } from '../../menu/config.ts';

const ModeSchema = t.Union([t.Literal('merge'), t.Literal('override')]);

export function createMenuSourceAdminRoutes() {
  return new Elysia()
    .post(
      '/menu/source',
      async ({ body, set }) => {
        const raw = body.url.trim();
        if (!raw) {
          set.status = 400;
          return { error: 'url required' };
        }
        if (!parseGistUrl(raw)) {
          set.status = 400;
          return {
            error: 'invalid gist URL (expected https://gist.github.com/<user>/<id>[/<hash>])',
          };
        }
        await applyMenuGistUrl(raw, body.mode ?? 'merge');
        await reloadMenuConfig();
        return { mode: body.mode ?? 'merge', source: getMenuSource() };
      },
      {
        body: t.Object({ url: t.String(), mode: t.Optional(ModeSchema) }),
        detail: {
          tags: ['menu'],
          menu: { group: 'hidden' },
          summary: 'Set gist URL (modes: merge|override)',
        },
      },
    )
    .delete(
      '/menu/source',
      async () => {
        clearMenuGistUrl();
        await reloadMenuConfig();
        return getMenuSource();
      },
      {
        detail: {
          tags: ['menu'],
          menu: { group: 'hidden' },
          summary: 'Clear persisted gist URL',
        },
      },
    )
    .post(
      '/menu/reset-all',
      async () => {
        const result = resetAllMenu();
        await reloadMenuConfig();
        return { ...result, source: getMenuSource() };
      },
      {
        detail: {
          tags: ['menu'],
          menu: { group: 'hidden' },
          summary: 'Reset all menu state — clear touchedAt on routes, drop custom items',
        },
      },
    )
    .get(
      '/menu/source/official',
      () => ({ url: getOfficialGistUrl() }),
      {
        detail: {
          tags: ['menu'],
          menu: { group: 'hidden' },
          summary: 'Official menu gist URL (from ORACLE_OFFICIAL_MENU_GIST)',
        },
      },
    );
}
