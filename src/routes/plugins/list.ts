import { Elysia } from 'elysia';
import { scanPlugins } from './model.ts';

export const pluginsListRoute = new Elysia().get('/api/plugins', () => scanPlugins());
