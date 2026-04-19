import { Elysia } from 'elysia';
import { getSetting, setSetting } from '../../db/index.ts';
import { UpdateSettingsBody } from './model.ts';

export const updateSettingsRoute = new Elysia().post('/', async ({ body, set }) => {
  if (body.newPassword) {
    const existingHash = getSetting('auth_password_hash');
    if (existingHash) {
      if (!body.currentPassword) {
        set.status = 400;
        return { error: 'Current password required' };
      }
      const valid = await Bun.password.verify(body.currentPassword, existingHash);
      if (!valid) {
        set.status = 401;
        return { error: 'Current password is incorrect' };
      }
    }
    const hash = await Bun.password.hash(body.newPassword);
    setSetting('auth_password_hash', hash);
  }

  if (body.removePassword === true) {
    const existingHash = getSetting('auth_password_hash');
    if (existingHash && body.currentPassword) {
      const valid = await Bun.password.verify(body.currentPassword, existingHash);
      if (!valid) {
        set.status = 401;
        return { error: 'Current password is incorrect' };
      }
    }
    setSetting('auth_password_hash', null);
    setSetting('auth_enabled', 'false');
  }

  if (typeof body.authEnabled === 'boolean') {
    if (body.authEnabled && !getSetting('auth_password_hash')) {
      set.status = 400;
      return { error: 'Cannot enable auth without password' };
    }
    setSetting('auth_enabled', body.authEnabled ? 'true' : 'false');
  }

  if (typeof body.localBypass === 'boolean') {
    setSetting('auth_local_bypass', body.localBypass ? 'true' : 'false');
  }

  return {
    success: true,
    authEnabled: getSetting('auth_enabled') === 'true',
    localBypass: getSetting('auth_local_bypass') !== 'false',
    hasPassword: !!getSetting('auth_password_hash'),
  };
}, {
  body: UpdateSettingsBody,
  detail: {
    tags: ['settings', 'nav:hidden'],
    summary: 'Update oracle settings',
  },
});
