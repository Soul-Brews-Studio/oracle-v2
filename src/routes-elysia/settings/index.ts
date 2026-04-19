import { Elysia } from 'elysia';
import { getSettingsRoute } from './get.ts';
import { updateSettingsRoute } from './update.ts';

export const settingsRoutes = new Elysia({ prefix: '/api/settings' })
  .use(getSettingsRoute)
  .use(updateSettingsRoute);

export * from './model.ts';
