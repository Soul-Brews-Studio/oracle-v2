/**
 * Health Routes (Elysia) — /api/health, /api/stats, /api/oracles
 */
import { Elysia } from 'elysia';
import { healthEndpoint } from './health.ts';
import { statsEndpoint } from './stats.ts';
import { oraclesEndpoint } from './oracles.ts';

export const healthRoutes = new Elysia({ prefix: '/api' })
  .use(healthEndpoint)
  .use(statsEndpoint)
  .use(oraclesEndpoint);
