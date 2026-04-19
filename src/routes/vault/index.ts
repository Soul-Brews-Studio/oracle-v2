import { Elysia } from 'elysia';
import { SESSION_COOKIE_NAME, isAuthenticated } from '../auth/index.ts';
import { vaultSyncRoute } from './sync.ts';

export const vaultRoutes = new Elysia({ prefix: '/api/vault' })
  .onBeforeHandle(({ server, request, cookie, set }) => {
    const sessionValue = cookie[SESSION_COOKIE_NAME]?.value as string | undefined;
    if (!isAuthenticated(server, request, sessionValue)) {
      set.status = 401;
      return { error: 'Unauthorized', requiresAuth: true };
    }
  })
  .use(vaultSyncRoute);
