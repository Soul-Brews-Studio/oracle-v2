import { Elysia } from 'elysia';
import { linkTraces } from '../../trace/handler.ts';
import { prevIdParam, linkBody } from './model.ts';

export const traceLinkRoute = new Elysia().post('/api/traces/:prevId/link', async ({ params, body, set }) => {
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
  params: prevIdParam,
  body: linkBody,
  detail: {
    tags: ['traces', 'nav:hidden'],
    summary: 'Link two traces',
  },
});
