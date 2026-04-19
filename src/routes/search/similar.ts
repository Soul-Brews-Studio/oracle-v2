/**
 * GET /api/similar — vector nearest-neighbor lookup for a given doc id.
 */

import { Elysia } from 'elysia';
import { handleSimilar } from '../../server/handlers.ts';
import { SimilarQuery } from './model.ts';

export const similarEndpoint = new Elysia().get(
  '/similar',
  async ({ query, set }) => {
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
  },
  {
    query: SimilarQuery,
    detail: {
      tags: ['search', 'nav:hidden'],
      summary: 'Vector nearest-neighbor lookup by doc id',
    },
  },
);
