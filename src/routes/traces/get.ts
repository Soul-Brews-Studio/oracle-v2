import { Elysia } from 'elysia';
import { getTrace } from '../../trace/handler.ts';
import { traceIdParam } from './model.ts';

export const traceGetRoute = new Elysia().get('/api/traces/:id', ({ params, set }) => {
  const trace = getTrace(params.id);
  if (!trace) {
    set.status = 404;
    return { error: 'Trace not found' };
  }
  return trace;
}, {
  params: traceIdParam,
  detail: {
    tags: ['traces', 'nav:hidden'],
    summary: 'Get a single trace',
  },
});
