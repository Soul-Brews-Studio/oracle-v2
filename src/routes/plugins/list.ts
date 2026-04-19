import { Elysia } from 'elysia';
import { scanPlugins } from './model.ts';

export const pluginsListRoute = new Elysia().get('/api/plugins', () => scanPlugins(), {
  detail: {
    tags: ['plugins', 'nav:main', 'order:70'],
    summary: 'List available plugins',
  },
});
