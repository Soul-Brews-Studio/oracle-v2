/**
 * Search Routes (Elysia) — /api/search, /api/reflect, /api/similar, /api/map, /api/map3d, /api/list
 */

import { Elysia, t } from 'elysia';
import {
  handleSearch,
  handleReflect,
  handleList,
  handleSimilar,
  handleMap,
  handleMap3d,
} from '../server/handlers.ts';

export const searchRoutes = new Elysia({ prefix: '/api' })
  .get('/search', async ({ query, set }) => {
    const q = query.q;
    if (!q) {
      set.status = 400;
      return { error: 'Missing query parameter: q' };
    }

    const sanitizedQ = q
      .replace(/<[^>]*>/g, '')
      .replace(/[\x00-\x1f]/g, '')
      .trim();
    if (!sanitizedQ) {
      set.status = 400;
      return { error: 'Invalid query: empty after sanitization' };
    }

    const type = query.type ?? 'all';
    const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '10')));
    const offset = Math.max(0, parseInt(query.offset ?? '0'));
    const mode = (query.mode ?? 'hybrid') as 'hybrid' | 'fts' | 'vector';
    const project = query.project;
    const cwd = query.cwd;
    const model = query.model;

    try {
      const result = await handleSearch(sanitizedQ, type, limit, offset, mode, project, cwd, model);
      return { ...result, query: sanitizedQ };
    } catch {
      set.status = 400;
      return { results: [], total: 0, query: sanitizedQ, error: 'Search failed' };
    }
  }, {
    query: t.Object({
      q: t.Optional(t.String()),
      type: t.Optional(t.String()),
      limit: t.Optional(t.String()),
      offset: t.Optional(t.String()),
      mode: t.Optional(t.String()),
      project: t.Optional(t.String()),
      cwd: t.Optional(t.String()),
      model: t.Optional(t.String()),
    }),
  })
  .get('/reflect', () => handleReflect())
  .get('/similar', async ({ query, set }) => {
    const id = query.id;
    if (!id) {
      set.status = 400;
      return { error: 'Missing query parameter: id' };
    }
    const limit = Math.min(50, Math.max(1, parseInt(query.limit ?? '5')));
    const model = query.model;
    try {
      return await handleSimilar(id, limit, model);
    } catch (e: any) {
      set.status = 404;
      return { error: e.message, results: [], docId: id };
    }
  }, {
    query: t.Object({
      id: t.Optional(t.String()),
      limit: t.Optional(t.String()),
      model: t.Optional(t.String()),
    }),
  })
  .get('/map', async ({ set }) => {
    try {
      return await handleMap();
    } catch (e: any) {
      set.status = 500;
      return { error: e.message, documents: [], total: 0 };
    }
  })
  .get('/map3d', async ({ query, set }) => {
    try {
      const model = query.model || undefined;
      return await handleMap3d(model);
    } catch (e: any) {
      set.status = 500;
      return { error: e.message, documents: [], total: 0 };
    }
  }, {
    query: t.Object({
      model: t.Optional(t.String()),
    }),
  })
  .get('/list', ({ query }) => {
    const type = query.type ?? 'all';
    const limit = Math.min(1000, Math.max(1, parseInt(query.limit ?? '10')));
    const offset = Math.max(0, parseInt(query.offset ?? '0'));
    const group = query.group !== 'false';
    return handleList(type, limit, offset, group);
  }, {
    query: t.Object({
      type: t.Optional(t.String()),
      limit: t.Optional(t.String()),
      offset: t.Optional(t.String()),
      group: t.Optional(t.String()),
    }),
  });
