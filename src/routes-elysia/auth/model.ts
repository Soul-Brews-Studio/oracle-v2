import { t } from 'elysia';

export const LoginBody = t.Object({
  password: t.Optional(t.String()),
});

export const AuthStatusResponse = t.Object({
  authenticated: t.Boolean(),
  authEnabled: t.Boolean(),
  hasPassword: t.Boolean(),
  localBypass: t.Boolean(),
  isLocal: t.Boolean(),
});
