import { Elysia } from 'elysia';
import { threadsListRoute } from './threads-list.ts';
import { threadCreateRoute } from './thread-create.ts';
import { threadGetRoute } from './thread-get.ts';
import { threadStatusRoute } from './thread-status.ts';

export const forumApi = new Elysia()
  .use(threadsListRoute)
  .use(threadCreateRoute)
  .use(threadGetRoute)
  .use(threadStatusRoute);
