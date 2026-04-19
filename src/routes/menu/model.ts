import { t } from 'elysia';

export const MenuItemSchema = t.Recursive((Self) =>
  t.Object({
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
    children: t.Optional(t.Array(Self)),
    source: t.Union([
      t.Literal('api'),
      t.Literal('frontend'),
      t.Literal('plugin'),
    ]),
  }),
);

export type MenuGroup = 'main' | 'tools' | 'hidden' | 'admin';
export type MenuSource = 'api' | 'frontend' | 'plugin';

export interface MenuItem {
  path: string;
  label: string;
  group: MenuGroup;
  order: number;
  icon?: string;
  studio?: string | null;
  access?: 'public' | 'auth';
  children?: MenuItem[];
  source: MenuSource;
}
