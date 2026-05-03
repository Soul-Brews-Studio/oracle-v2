/**
 * GET /api/map — 2D projection of all embeddings.
 */

import { Elysia } from 'elysia';
import { handleMap } from '../../server/vector-handlers.ts';

export const mapEndpoint = new Elysia().get('/map', async ({ set }) => {
  try {
    return await handleMap();
  } catch (e: any) {
    set.status = 500;
    return { error: e.message, documents: [], total: 0 };
  }
}, {
  detail: {
    tags: ['vector'],
    menu: { group: 'tools', order: 20 },
    summary: '2D projection of embeddings',
  },
});
