/**
 * Session + auth helpers — pure functions, no Elysia.
 * Shared by the auth/settings/feed route groups.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { getSetting } from '../../db/index.ts';

const SESSION_SECRET = process.env.ORACLE_SESSION_SECRET || crypto.randomUUID();
export const SESSION_COOKIE_NAME = 'oracle_session';
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

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
