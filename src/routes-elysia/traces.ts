/**
 * Trace Routes (Elysia) — /api/traces/*, linking, chaining
 */

import { Elysia, t } from 'elysia';
import {
  listTraces,
  getTrace,
  getTraceChain,
  linkTraces,
  unlinkTraces,
  getTraceLinkedChain,
} from '../trace/handler.ts';

export const tracesApi = new Elysia()
  .get('/api/traces', ({ query }) => {
    const limit = parseInt(query.limit || '50');
    const offset = parseInt(query.offset || '0');

    return listTraces({
      query: query.query || undefined,
      status: (query.status as 'raw' | 'reviewed' | 'distilled' | undefined) || undefined,
      project: query.project || undefined,
      limit,
      offset,
    });
  }, {
    query: t.Object({
      query: t.Optional(t.String()),
      status: t.Optional(t.String()),
      project: t.Optional(t.String()),
      limit: t.Optional(t.String()),
      offset: t.Optional(t.String()),
    }),
  })

  .get('/api/traces/:id', ({ params, set }) => {
    const trace = getTrace(params.id);
    if (!trace) {
      set.status = 404;
      return { error: 'Trace not found' };
    }
    return trace;
  }, {
    params: t.Object({ id: t.String() }),
  })

  .get('/api/traces/:id/chain', ({ params, query }) => {
    const direction = (query.direction as 'up' | 'down' | 'both') || 'both';
    return getTraceChain(params.id, direction);
  }, {
    params: t.Object({ id: t.String() }),
    query: t.Object({ direction: t.Optional(t.String()) }),
  })

  .post('/api/traces/:prevId/link', async ({ params, body, set }) => {
    try {
      const { nextId } = (body as any) ?? {};
      if (!nextId) {
        set.status = 400;
        return { error: 'Missing nextId in request body' };
      }
      const result = linkTraces(params.prevId, nextId);
      if (!result.success) {
        set.status = 400;
        return { error: result.message };
      }
      return result;
    } catch (err) {
      console.error('Link traces error:', err);
      set.status = 500;
      return { error: 'Failed to link traces' };
    }
  }, {
    params: t.Object({ prevId: t.String() }),
    body: t.Unknown(),
  })

  .delete('/api/traces/:id/link', async ({ params, query, set }) => {
    try {
      const direction = query.direction as 'prev' | 'next';
      if (!direction || !['prev', 'next'].includes(direction)) {
        set.status = 400;
        return { error: 'Missing or invalid direction (prev|next)' };
      }
      const result = unlinkTraces(params.id, direction);
      if (!result.success) {
        set.status = 400;
        return { error: result.message };
      }
      return result;
    } catch (err) {
      console.error('Unlink traces error:', err);
      set.status = 500;
      return { error: 'Failed to unlink traces' };
    }
  }, {
    params: t.Object({ id: t.String() }),
    query: t.Object({ direction: t.Optional(t.String()) }),
  })

  .get('/api/traces/:id/linked-chain', async ({ params, set }) => {
    try {
      return getTraceLinkedChain(params.id);
    } catch (err) {
      console.error('Get linked chain error:', err);
      set.status = 500;
      return { error: 'Failed to get linked chain' };
    }
  }, {
    params: t.Object({ id: t.String() }),
  });
