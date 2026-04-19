import { Elysia } from 'elysia';
import { getTraceChain } from '../../trace/handler.ts';
import { traceIdParam, chainQuery } from './model.ts';

export const traceChainRoute = new Elysia().get('/api/traces/:id/chain', ({ params, query }) => {
  const direction = (query.direction as 'up' | 'down' | 'both') || 'both';
  return getTraceChain(params.id, direction);
}, {
  params: traceIdParam,
  query: chainQuery,
  detail: {
    tags: ['traces', 'nav:hidden'],
    summary: 'Get causal chain for a trace',
  },
});
