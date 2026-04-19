import { Elysia } from 'elysia';
import { updateThreadStatus } from '../../forum/handler.ts';
import { threadIdParam, threadStatusBody } from './model.ts';

export const threadStatusRoute = new Elysia().patch('/api/thread/:id/status', async ({ params, body, set }) => {
  const threadId = parseInt(params.id, 10);
  try {
    const data = body as any;
    if (!data.status) {
      set.status = 400;
      return { error: 'Missing required field: status' };
    }
    updateThreadStatus(threadId, data.status);
    return { success: true, thread_id: threadId, status: data.status };
  } catch (e) {
    set.status = 400;
    return { error: 'Invalid JSON' };
  }
}, {
  params: threadIdParam,
  body: threadStatusBody,
  detail: {
    tags: ['forum', 'nav:hidden'],
    summary: 'Update a thread status',
  },
});
