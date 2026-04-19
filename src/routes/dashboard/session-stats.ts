import { Elysia } from 'elysia';
import { gt, sql } from 'drizzle-orm';
import { db, searchLog, learnLog } from '../../db/index.ts';
import { SessionStatsQuery } from './model.ts';

export const sessionStatsEndpoint = new Elysia().get('/session/stats', ({ query }) => {
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
  query: SessionStatsQuery,
  detail: {
    tags: ['dashboard', 'nav:hidden'],
    summary: 'Session-level search + learn counts',
  },
});
