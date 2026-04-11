/**
 * Rate Limiting Middleware
 *
 * In-memory rate limiter using token bucket algorithm.
 * For production, consider using Redis or similar for distributed rate limiting.
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const store = new Map<string, RateLimitEntry>();

export interface RateLimitOptions {
  /** Requests allowed per window */
  limit: number;
  /** Window duration in milliseconds */
  windowMs: number;
  /** Skip successful requests from counting (default: false) */
  skipSuccessfulRequests?: boolean;
}

/**
 * Get client identifier from request context
 */
function getClientId(c: any): string {
  // Try to get real IP from connection info
  const connInfo = c.env?.remoteAddress;
  if (connInfo) return `ip:${connInfo}`;

  // Fallback to session cookie if available
  const session = c.req.header('cookie')?.match(/oracle_session=([^;]+)/)?.[1];
  if (session) return `session:${session}`;

  // Last resort: use user agent + IP (stored in header by reverse proxy)
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) return ` forwarded:${forwarded.split(',')[0].trim()}`;

  return 'unknown';
}

/**
 * Rate limiting middleware factory
 */
export function rateLimit(options: RateLimitOptions) {
  const { limit, windowMs, skipSuccessfulRequests = false } = options;

  return async (c: any, next: any) => {
    const clientId = getClientId(c);
    const now = Date.now();

    // Get or create rate limit entry
    let entry = store.get(clientId);
    if (!entry || now > entry.resetTime) {
      entry = { count: 0, resetTime: now + windowMs };
      store.set(clientId, entry);
    }

    // Check if limit exceeded
    if (entry.count >= limit) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      c.header('X-RateLimit-Limit', String(limit));
      c.header('X-RateLimit-Remaining', '0');
      c.header('X-RateLimit-Reset', String(entry.resetTime));
      c.header('Retry-After', String(retryAfter));
      return c.json({ error: 'Too many requests', retryAfter }, 429);
    }

    // Increment counter
    entry.count++;

    // Set rate limit headers
    c.header('X-RateLimit-Limit', String(limit));
    c.header('X-RateLimit-Remaining', String(Math.max(0, limit - entry.count)));
    c.header('X-RateLimit-Reset', String(entry.resetTime));

    // Continue to next middleware
    await next();

    // Decrement on successful response if option is set
    if (skipSuccessfulRequests && c.res.status < 400) {
      entry.count--;
    }
  };
}

/**
 * Clean up expired entries (call periodically)
 */
export function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.resetTime) {
      store.delete(key);
    }
  }
}

// Run cleanup every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupExpiredEntries, 5 * 60 * 1000);
}

/**
 * Pre-configured rate limiters for common use cases
 */
export const rateLimitStrict = rateLimit({ limit: 10, windowMs: 60 * 1000 }); // 10/minute
export const rateLimitAuth = rateLimit({ limit: 5, windowMs: 60 * 1000 }); // 5/minute (auth endpoints)
export const rateLimitStandard = rateLimit({ limit: 100, windowMs: 60 * 1000 }); // 100/minute
export const rateLimitLoose = rateLimit({ limit: 1000, windowMs: 60 * 1000 }); // 1000/minute
