import { Elysia } from 'elysia';
import { SESSION_COOKIE_NAME, isAuthenticated } from '../auth/session.ts';

export const authGuard = new Elysia({ name: 'feed-auth-guard' })
  .onBeforeHandle(({ server, request, cookie, set }) => {
    const sessionValue = cookie[SESSION_COOKIE_NAME]?.value as string | undefined;
    if (!isAuthenticated(server, request, sessionValue)) {
      set.status = 401;
      return { error: 'Unauthorized', requiresAuth: true };
    }
  });
