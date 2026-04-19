import { t } from 'elysia';

/**
 * LoginBody uses `t.Optional(t.String())` instead of `t.String()` so the
 * handler can return the legacy `{ success: false, error: 'Password required' }`
 * 400 shape that tests/http/auth-settings.test.ts asserts on an empty body.
 * A strict `t.String()` would short-circuit into Elysia's default 422
 * validation error and break the contract test.
 */
export const LoginBody = t.Object({
  password: t.Optional(t.String()),
});

export const SessionCookie = t.Cookie({
  oracle_session: t.Optional(t.String()),
});
