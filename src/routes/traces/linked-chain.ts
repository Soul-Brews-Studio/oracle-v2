import { Elysia } from 'elysia';
import { getTraceLinkedChain } from '../../trace/handler.ts';
import { traceIdParam } from './model.ts';

export const traceLinkedChainRoute = new Elysia().get('/api/traces/:id/linked-chain', async ({ params, set }) => {
  try {
    return getTraceLinkedChain(params.id);
  } catch (err) {
    console.error('Get linked chain error:', err);
    set.status = 500;
    return { error: 'Failed to get linked chain' };
  }
}, {
  params: traceIdParam,
  detail: {
    tags: ['traces', 'nav:hidden'],
    summary: 'Walk explicit trace link graph',
  },
});
