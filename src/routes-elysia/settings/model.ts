import { t } from 'elysia';

export const UpdateSettingsBody = t.Object({
  newPassword: t.Optional(t.String()),
  currentPassword: t.Optional(t.String()),
  removePassword: t.Optional(t.Boolean()),
  authEnabled: t.Optional(t.Boolean()),
  localBypass: t.Optional(t.Boolean()),
});
