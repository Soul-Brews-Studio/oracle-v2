/**
 * CSRF Protection Middleware
 *
 * State-changing operations require a CSRF token.
 * Tokens are generated per-session and validated on POST/PUT/DELETE/PATCH requests.
 */

import { createHmac, randomBytes } from 'crypto';

const CSRF_COOKIE_NAME = 'oracle_csrf';
const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRFQueryParam = 'csrf_token';

// Token storage (in production, use Redis or similar)
const tokens = new Map<string, { token: string; expires: number }>();

// Session secret (must be the same as auth secret)
const CSRF_SECRET = process.env.ORACLE_SESSION_SECRET || crypto.randomUUID();
const TOKEN_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Generate CSRF token for session
 */
export function generateCSRFToken(sessionId: string): string {
  const token = randomBytes(32).toString('hex');
  const expires = Date.now() + TOKEN_DURATION_MS;

  // Create HMAC signature
  const signature = createHmac('sha256', CSRF_SECRET)
    .update(`${sessionId}:${token}`)
    .digest('hex');

  const signedToken = `${token}:${signature}`;
  tokens.set(sessionId, { token: signedToken, expires });

  return signedToken;
}

/**
 * Verify CSRF token
 */
export function verifyCSRFToken(sessionId: string, inputToken: string): boolean {
  if (!inputToken) return false;

  const stored = tokens.get(sessionId);
  if (!stored || stored.expires < Date.now()) {
    tokens.delete(sessionId);
    return false;
  }

  const [token, signature] = inputToken.split(':');
  if (!token || !signature) return false;

  // Verify signature
  const expectedSignature = createHmac('sha256', CSRF_SECRET)
    .update(`${sessionId}:${token}`)
    .digest('hex');

  return signature === expectedSignature;
}

/**
 * Extract session identifier from request
 */
function getSessionId(c: any): string | null {
  // Try session cookie first
  const sessionCookie = c.req.raw?.headers?.get('cookie');
  if (sessionCookie) {
    const match = sessionCookie.match(/oracle_session=([^;]+)/);
    if (match) return match[1];
  }

  // Fall back to authorization header if available
  const auth = c.req.raw?.headers?.get('authorization');
  if (auth) return auth.slice(0, 20); // Partial hash as session ID

  return null;
}

/**
 * Paths that require CSRF protection (state-changing operations)
 */
const PROTECTED_METHODS = ['POST', 'PUT', 'DELETE', 'PATCH'];

/**
 * Paths that are exempt from CSRF (public endpoints)
 */
const EXEMPT_PATHS = [
  '/api/auth/login',
  '/api/auth/status',
  '/api/auth/csrf-token',
  '/api/health',
  '/api/search', // GET-only, safe
  '/api/list', // GET-only, safe
  '/api/read', // GET-only, safe
  '/api/stats', // GET-only, safe
  '/api/graph', // GET-only, safe
  '/api/context', // GET-only, safe
  '/api/doc/', // GET-only, safe
  '/api/logs', // GET-only, safe
  '/api/plugins', // GET-only, safe
  '/api/feed/', // GET-only, safe
  '/api/dashboard', // GET-only, safe
  '/api/schedule/', // GET-only, safe
  '/api/supersede', // GET-only, safe
  '/api/threads', // GET-only, safe
  '/api/thread/', // GET-only, safe
  '/api/inbox', // GET-only, safe
];

/**
 * CSRF protection middleware
 */
export function csrfProtection(options: {
  exemptPaths?: string[];
  getTokenFrom?: (c: any) => string | null;
} = {}) {
  const { exemptPaths = EXEMPT_PATHS, getTokenFrom } = options;

  return async (c: any, next: any) => {
    const method = c.req.method;
    const path = c.req.path;

    // Skip for safe methods and exempt paths
    if (!PROTECTED_METHODS.includes(method)) {
      return next();
    }

    // Check if path is exempt
    const isExempt = exemptPaths.some(exemptPath => {
      if (exemptPath.endsWith('/')) {
        return path.startsWith(exemptPath);
      }
      return path === exemptPath;
    });

    if (isExempt) {
      return next();
    }

    // Get session ID
    const sessionId = getSessionId(c);
    if (!sessionId) {
      return c.json({ error: 'Unauthorized: no session' }, 401);
    }

    // Get token from header or query param
    let token = c.req.header(CSRF_HEADER_NAME);
    if (!token) {
      token = c.req.query(CSRFQueryParam);
    }
    if (getTokenFrom) {
      token = getTokenFrom(c) || token;
    }

    // Verify token
    if (!verifyCSRFToken(sessionId, token || '')) {
      return c.json({ error: 'Invalid CSRF token', CSRF_HEADER_NAME }, 403);
    }

    return next();
  };
}

/**
 * Get or create CSRF token for current session
 */
export function getCSRFTokenForSession(sessionId: string): string {
  const existing = tokens.get(sessionId);
  if (existing && existing.expires > Date.now()) {
    return existing.token;
  }
  return generateCSRFToken(sessionId);
}

/**
 * Clean up expired tokens
 */
export function cleanupExpiredTokens(): void {
  const now = Date.now();
  for (const [key, value] of tokens.entries()) {
    if (value.expires < now) {
      tokens.delete(key);
    }
  }
}

// Run cleanup every hour
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupExpiredTokens, 60 * 60 * 1000);
}
