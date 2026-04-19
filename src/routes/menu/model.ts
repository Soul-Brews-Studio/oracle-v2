/**
 * TypeBox schemas for /api/menu.
 */

import { t } from 'elysia';
import type { Static } from 'elysia';

export const MenuItemSchema = t.Object({
  path: t.String(),
  label: t.String(),
  group: t.Union([
    t.Literal('main'),
    t.Literal('tools'),
    t.Literal('hidden'),
    t.Literal('admin'),
  ]),
  order: t.Number(),
  icon: t.Optional(t.String()),
  studio: t.Optional(t.Nullable(t.String())),
  access: t.Optional(t.Union([t.Literal('public'), t.Literal('auth')])),
  source: t.Union([
    t.Literal('api'),
    t.Literal('page'),
    t.Literal('plugin'),
  ]),
  added: t.Optional(t.Boolean()),
});

export type MenuItem = Static<typeof MenuItemSchema>;

export const MenuResponseSchema = t.Object({
  items: t.Array(MenuItemSchema),
});

export type MenuResponse = Static<typeof MenuResponseSchema>;
