/**
 * Settings Routes (Elysia) — /api/settings (GET + POST)
 *
 * Behavior parity with src/routes/settings.ts (Hono).
 * Both GET and POST require auth (mirrors the Hono /api/* middleware).
 */

import { Elysia, t } from 'elysia';
import { getSetting, setSetting } from '../db/index.ts';
import { SESSION_COOKIE_NAME, isAuthenticated } from './auth.ts';

export const settingsApi = new Elysia()
  .onBeforeHandle(({ server, request, cookie, set }) => {
    const sessionValue = cookie[SESSION_COOKIE_NAME]?.value as string | undefined;
    if (!isAuthenticated(server, request, sessionValue)) {
      set.status = 401;
      return { error: 'Unauthorized', requiresAuth: true };
    }
  })
  .get('/api/settings', () => {
    const authEnabled = getSetting('auth_enabled') === 'true';
    const localBypass = getSetting('auth_local_bypass') !== 'false';
    const hasPassword = !!getSetting('auth_password_hash');
    const vaultRepo = getSetting('vault_repo');
    return { authEnabled, localBypass, hasPassword, vaultRepo };
  })
  .post('/api/settings', async ({ body, set }) => {
    const b = body as {
      newPassword?: string;
      currentPassword?: string;
      removePassword?: boolean;
      authEnabled?: boolean;
      localBypass?: boolean;
    };

    if (b.newPassword) {
      const existingHash = getSetting('auth_password_hash');
      if (existingHash) {
        if (!b.currentPassword) {
          set.status = 400;
          return { error: 'Current password required' };
        }
        const valid = await Bun.password.verify(b.currentPassword, existingHash);
        if (!valid) {
          set.status = 401;
          return { error: 'Current password is incorrect' };
        }
      }
      const hash = await Bun.password.hash(b.newPassword);
      setSetting('auth_password_hash', hash);
    }

    if (b.removePassword === true) {
      const existingHash = getSetting('auth_password_hash');
      if (existingHash && b.currentPassword) {
        const valid = await Bun.password.verify(b.currentPassword, existingHash);
        if (!valid) {
          set.status = 401;
          return { error: 'Current password is incorrect' };
        }
      }
      setSetting('auth_password_hash', null);
      setSetting('auth_enabled', 'false');
    }

    if (typeof b.authEnabled === 'boolean') {
      if (b.authEnabled && !getSetting('auth_password_hash')) {
        set.status = 400;
        return { error: 'Cannot enable auth without password' };
      }
      setSetting('auth_enabled', b.authEnabled ? 'true' : 'false');
    }

    if (typeof b.localBypass === 'boolean') {
      setSetting('auth_local_bypass', b.localBypass ? 'true' : 'false');
    }

    return {
      success: true,
      authEnabled: getSetting('auth_enabled') === 'true',
      localBypass: getSetting('auth_local_bypass') !== 'false',
      hasPassword: !!getSetting('auth_password_hash'),
    };
  }, {
    body: t.Unknown(),
  });
