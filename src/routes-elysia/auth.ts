/**
 * Auth Routes (Elysia) — helpers, session cookies, /api/auth/{status,login,logout}
 *
 * Behavior parity with src/routes/auth.ts (Hono).
 */

import { Elysia, t } from 'elysia';
import { createHmac, timingSafeEqual } from 'crypto';
import { getSetting } from '../db/index.ts';

const SESSION_SECRET = process.env.ORACLE_SESSION_SECRET || crypto.randomUUID();
export const SESSION_COOKIE_NAME = 'oracle_session';
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function isLocalIp(ip: string): boolean {
  return ip === '127.0.0.1'
      || ip === '::1'
      || ip === 'localhost'
      || ip.startsWith('192.168.')
      || ip.startsWith('10.')
      || ip.startsWith('172.16.')
      || ip.startsWith('172.17.')
      || ip.startsWith('172.18.')
      || ip.startsWith('172.19.')
      || ip.startsWith('172.20.')
      || ip.startsWith('172.21.')
      || ip.startsWith('172.22.')
      || ip.startsWith('172.23.')
      || ip.startsWith('172.24.')
      || ip.startsWith('172.25.')
      || ip.startsWith('172.26.')
      || ip.startsWith('172.27.')
      || ip.startsWith('172.28.')
      || ip.startsWith('172.29.')
      || ip.startsWith('172.30.')
      || ip.startsWith('172.31.');
}

export function remoteAddress(server: any, request: Request): string {
  try {
    const info = server?.requestIP?.(request);
    if (info && typeof info.address === 'string') return info.address;
  } catch { /* ignore */ }
  return '127.0.0.1';
}

export function isLocalNetwork(server: any, request: Request): boolean {
  return isLocalIp(remoteAddress(server, request));
}

export function generateSessionToken(): string {
  const expires = Date.now() + SESSION_DURATION_MS;
  const signature = createHmac('sha256', SESSION_SECRET)
    .update(String(expires))
    .digest('hex');
  return `${expires}:${signature}`;
}

export function verifySessionToken(token: string): boolean {
  if (!token) return false;
  const colonIdx = token.indexOf(':');
  if (colonIdx === -1) return false;

  const expiresStr = token.substring(0, colonIdx);
  const signature = token.substring(colonIdx + 1);
  const expires = parseInt(expiresStr, 10);
  if (isNaN(expires) || expires < Date.now()) return false;

  const expectedSignature = createHmac('sha256', SESSION_SECRET)
    .update(expiresStr)
    .digest('hex');

  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(sigBuf, expectedBuf);
}

export function isAuthenticated(
  server: any,
  request: Request,
  sessionValue: string | undefined,
): boolean {
  const authEnabled = getSetting('auth_enabled') === 'true';
  if (!authEnabled) return true;

  const localBypass = getSetting('auth_local_bypass') !== 'false';
  if (localBypass && isLocalNetwork(server, request)) return true;

  return verifySessionToken(sessionValue || '');
}

export const authApi = new Elysia()
  .get('/api/auth/status', ({ server, request, cookie }) => {
    const sessionValue = cookie[SESSION_COOKIE_NAME]?.value as string | undefined;
    const authEnabled = getSetting('auth_enabled') === 'true';
    const hasPassword = !!getSetting('auth_password_hash');
    const localBypass = getSetting('auth_local_bypass') !== 'false';
    const isLocal = isLocalNetwork(server, request);
    const authenticated = isAuthenticated(server, request, sessionValue);

    return {
      authenticated,
      authEnabled,
      hasPassword,
      localBypass,
      isLocal,
    };
  })
  .post('/api/auth/login', async ({ body, server, request, cookie, set }) => {
    const { password } = body;
    if (!password) {
      set.status = 400;
      return { success: false, error: 'Password required' };
    }

    const storedHash = getSetting('auth_password_hash');
    if (!storedHash) {
      set.status = 400;
      return { success: false, error: 'No password configured' };
    }

    const valid = await Bun.password.verify(password, storedHash);
    if (!valid) {
      set.status = 401;
      return { success: false, error: 'Invalid password' };
    }

    const token = generateSessionToken();
    const isLocal = isLocalNetwork(server, request);
    cookie[SESSION_COOKIE_NAME].set({
      value: token,
      httpOnly: true,
      secure: !isLocal,
      sameSite: 'lax',
      maxAge: SESSION_DURATION_MS / 1000,
      path: '/',
    });

    return { success: true };
  }, {
    body: t.Object({ password: t.Optional(t.String()) }),
  })
  .post('/api/auth/logout', ({ cookie }) => {
    cookie[SESSION_COOKIE_NAME].set({
      value: '',
      expires: new Date(0),
      maxAge: 0,
      path: '/',
    });
    return { success: true };
  });
