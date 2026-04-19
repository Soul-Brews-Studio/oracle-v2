/**
 * Forum Routes (Elysia) — /api/threads, /api/thread, /api/thread/:id, /api/thread/:id/status
 */

import { Elysia, t } from 'elysia';
import {
  handleThreadMessage,
  listThreads,
  getFullThread,
  getMessages,
  updateThreadStatus,
} from '../forum/handler.ts';

export const forumApi = new Elysia()
  .get('/api/threads', ({ query }) => {
    const status = query.status as any;
    const limit = parseInt(query.limit || '20');
    const offset = parseInt(query.offset || '0');

    const threadList = listThreads({ status, limit, offset });
    return {
      threads: threadList.threads.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        message_count: getMessages(t.id).length,
        created_at: new Date(t.createdAt).toISOString(),
        issue_url: t.issueUrl,
      })),
      total: threadList.total,
    };
  }, {
    query: t.Object({
      status: t.Optional(t.String()),
      limit: t.Optional(t.String()),
      offset: t.Optional(t.String()),
    }),
  })

  .post('/api/thread', async ({ body, set }) => {
    try {
      const data = body as any;
      if (!data.message) {
        set.status = 400;
        return { error: 'Missing required field: message' };
      }
      const result = await handleThreadMessage({
        message: data.message,
        threadId: data.thread_id,
        title: data.title,
        role: data.role || 'human',
      });
      return {
        thread_id: result.threadId,
        message_id: result.messageId,
        status: result.status,
        oracle_response: result.oracleResponse,
        issue_url: result.issueUrl,
      };
    } catch (error) {
      set.status = 500;
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }, {
    body: t.Unknown(),
  })

  .get('/api/thread/:id', ({ params, set }) => {
    const threadId = parseInt(params.id, 10);
    if (isNaN(threadId)) {
      set.status = 400;
      return { error: 'Invalid thread ID' };
    }

    const threadData = getFullThread(threadId);
    if (!threadData) {
      set.status = 404;
      return { error: 'Thread not found' };
    }

    return {
      thread: {
        id: threadData.thread.id,
        title: threadData.thread.title,
        status: threadData.thread.status,
        created_at: new Date(threadData.thread.createdAt).toISOString(),
        issue_url: threadData.thread.issueUrl,
      },
      messages: threadData.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        author: m.author,
        principles_found: m.principlesFound,
        patterns_found: m.patternsFound,
        created_at: new Date(m.createdAt).toISOString(),
      })),
    };
  }, {
    params: t.Object({ id: t.String() }),
  })

  .patch('/api/thread/:id/status', async ({ params, body, set }) => {
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
    params: t.Object({ id: t.String() }),
    body: t.Unknown(),
  });
