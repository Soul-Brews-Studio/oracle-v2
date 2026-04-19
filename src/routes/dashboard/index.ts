/**
 * Dashboard Routes (Elysia) — /api/dashboard/*, /api/session/stats
 */
import { Elysia } from 'elysia';
import { summaryEndpoint } from './summary.ts';
import { activityEndpoint } from './activity.ts';
import { growthEndpoint } from './growth.ts';
import { sessionStatsEndpoint } from './session-stats.ts';

export const dashboardRoutes = new Elysia({ prefix: '/api' })
  .use(summaryEndpoint)
  .use(activityEndpoint)
  .use(growthEndpoint)
  .use(sessionStatsEndpoint);
