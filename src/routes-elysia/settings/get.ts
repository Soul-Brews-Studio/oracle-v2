import { Elysia } from 'elysia';
import { getSetting } from '../../db/index.ts';
import { authGuard } from './guard.ts';

export const getSettingsRoute = new Elysia()
  .use(authGuard)
  .get('/', () => {
    const authEnabled = getSetting('auth_enabled') === 'true';
    const localBypass = getSetting('auth_local_bypass') !== 'false';
    const hasPassword = !!getSetting('auth_password_hash');
    const vaultRepo = getSetting('vault_repo');
    return { authEnabled, localBypass, hasPassword, vaultRepo };
  });
