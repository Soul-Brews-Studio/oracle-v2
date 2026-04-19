import { Elysia } from 'elysia';
import { getSetting } from '../../db/index.ts';
import {
  SESSION_COOKIE_NAME,
  isAuthenticated,
  isLocalNetwork,
} from './index.ts';

export const statusRoute = new Elysia().get('/status', ({ server, request, cookie }) => {
  const sessionValue = cookie[SESSION_COOKIE_NAME]?.value as string | undefined;
  const authEnabled = getSetting('auth_enabled') === 'true';
  const hasPassword = !!getSetting('auth_password_hash');
  const localBypass = getSetting('auth_local_bypass') !== 'false';
  const isLocal = isLocalNetwork(server, request);
  const authenticated = isAuthenticated(server, request, sessionValue);

  return { authenticated, authEnabled, hasPassword, localBypass, isLocal };
}, {
  detail: {
    tags: ['auth', 'nav:hidden'],
    summary: 'Current auth + session state',
  },
});
