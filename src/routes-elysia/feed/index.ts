import { Elysia } from 'elysia';
import { SESSION_COOKIE_NAME, isAuthenticated } from '../auth/index.ts';
import { listFeedRoute } from './list.ts';
import { createFeedRoute } from './create.ts';

export const feedRoutes = new Elysia({ prefix: '/api/feed' })
  .onBeforeHandle(({ server, request, cookie, set }) => {
    const sessionValue = cookie[SESSION_COOKIE_NAME]?.value as string | undefined;
    if (!isAuthenticated(server, request, sessionValue)) {
      set.status = 401;
      return { error: 'Unauthorized', requiresAuth: true };
    }
  })
  .use(listFeedRoute)
  .use(createFeedRoute);

export * from './model.ts';
