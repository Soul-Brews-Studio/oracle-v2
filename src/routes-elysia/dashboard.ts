/**
 * Dashboard Routes (Elysia) — /api/dashboard/*, /api/session/stats
 */

import { Elysia, t } from 'elysia';
import { gt, sql } from 'drizzle-orm';
import { db, searchLog, learnLog } from '../db/index.ts';
import {
  handleDashboardSummary,
  handleDashboardActivity,
  handleDashboardGrowth,
} from '../server/dashboard.ts';

export const dashboardRoutes = new Elysia({ prefix: '/api' })
  .get('/dashboard', () => handleDashboardSummary())
  .get('/dashboard/summary', () => handleDashboardSummary())
  .get('/dashboard/activity', ({ query }) => {
    const parsed = parseInt(query.days ?? '7');
    const days = Number.isFinite(parsed) ? parsed : 7;
    return handleDashboardActivity(days);
  }, {
    query: t.Object({ days: t.Optional(t.String()) }),
  })
  .get('/dashboard/growth', ({ query }) => {
    const period = query.period ?? 'week';
    return handleDashboardGrowth(period);
  }, {
    query: t.Object({ period: t.Optional(t.String()) }),
  })
  .get('/session/stats', ({ query }) => {
    const since = query.since;
    const sinceTime = since !== undefined ? parseInt(since) : Date.now() - 24 * 60 * 60 * 1000;

    const searches = db.select({ count: sql<number>`count(*)` })
      .from(searchLog)
      .where(gt(searchLog.createdAt, sinceTime))
      .get();

    const learnings = db.select({ count: sql<number>`count(*)` })
      .from(learnLog)
      .where(gt(learnLog.createdAt, sinceTime))
      .get();

    return {
      searches: searches?.count || 0,
      learnings: learnings?.count || 0,
      since: sinceTime,
    };
  }, {
    query: t.Object({ since: t.Optional(t.String()) }),
  });
