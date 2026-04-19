/**
 * TypeBox schemas for /api/menu.
 */

import { t } from 'elysia';
import type { Static } from 'elysia';

export const MenuItemSchema = t.Object({
  path: t.String(),
  label: t.String(),
  group: t.Union([t.Literal('main'), t.Literal('tools'), t.Literal('hidden')]),
  order: t.Number(),
  source: t.Union([t.Literal('api'), t.Literal('page'), t.Literal('plugin')]),
  studio: t.Optional(t.String()),
});

export type MenuItem = Static<typeof MenuItemSchema>;

export const MenuResponseSchema = t.Object({
  items: t.Array(MenuItemSchema),
});

export type MenuResponse = Static<typeof MenuResponseSchema>;
