/**
 * GET /api/map3d — real PCA from LanceDB bge-m3 embeddings.
 */

import { Elysia } from 'elysia';
import { handleMap3d } from '../../server/handlers.ts';
import { Map3dQuery } from './model.ts';

export const map3dEndpoint = new Elysia().get(
  '/map3d',
  async ({ query, set }) => {
    try {
      const model = query.model || undefined;
      return await handleMap3d(model);
    } catch (e: any) {
      set.status = 500;
      return { error: e.message, documents: [], total: 0 };
    }
  },
  {
    query: Map3dQuery,
    detail: {
      tags: ['map', 'nav:tools', 'order:30'],
      summary: '3D PCA projection of embeddings',
    },
  },
);
