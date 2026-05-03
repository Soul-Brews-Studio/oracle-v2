/**
 * GET /api/vector/health — vector adapter liveness probe.
 *
 * Pings each registered embedding engine. Returns:
 *   - status: 'ok' | 'degraded' | 'down'
 *   - engines[]: per-engine ok/error
 *
 * Cheaper than /api/vector/stats (no count aggregation) — safe for
 * load-balancer health checks.
 */

import { Elysia } from 'elysia';
import { handleVectorHealth } from '../../server/vector-handlers.ts';

export const vectorHealthEndpoint = new Elysia().get(
  '/vector/health',
  async ({ set }) => {
    try {
      const result = await handleVectorHealth();
      if (result.status === 'down') set.status = 503;
      return result;
    } catch (e: any) {
      set.status = 500;
      return { error: e.message, status: 'down', engines: [], checked_at: new Date().toISOString() };
    }
  },
  {
    detail: {
      tags: ['vector'],
      menu: { group: 'hidden' },
      summary: 'Vector adapter liveness check',
    },
  },
);
