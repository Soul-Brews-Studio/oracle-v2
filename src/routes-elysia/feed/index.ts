import { Elysia } from 'elysia';
import { listFeedRoute } from './list.ts';
import { appendFeedRoute } from './append.ts';

export const feedRoutes = new Elysia({ prefix: '/api/feed' })
  .use(listFeedRoute)
  .use(appendFeedRoute);

export * from './model.ts';
