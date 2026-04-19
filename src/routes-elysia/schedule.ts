/**
 * Schedule Routes (Elysia) — /api/schedule/*, /api/schedule/md
 */

import { Elysia, t } from 'elysia';
import fs from 'fs';
import { eq } from 'drizzle-orm';
import { REPO_ROOT, SCHEDULE_PATH } from '../config.ts';
import { db, sqlite, schedule } from '../db/index.ts';
import { handleScheduleAdd, handleScheduleList } from '../tools/schedule.ts';
import type { ToolContext } from '../tools/types.ts';

export const scheduleApi = new Elysia()
  .get('/api/schedule/md', ({ set }) => {
    if (fs.existsSync(SCHEDULE_PATH)) {
      return fs.readFileSync(SCHEDULE_PATH, 'utf-8');
    }
    set.status = 404;
    return '';
  })

  .get('/api/schedule', async ({ query }) => {
    const ctx = { db, sqlite, repoRoot: REPO_ROOT } as Pick<ToolContext, 'db' | 'sqlite' | 'repoRoot'>;
    const result = await handleScheduleList(ctx as ToolContext, {
      date: query.date,
      from: query.from,
      to: query.to,
      filter: query.filter,
      status: query.status as 'pending' | 'done' | 'cancelled' | 'all' | undefined,
      limit: query.limit ? parseInt(query.limit) : undefined,
    });
    const text = result.content[0]?.text || '{}';
    return JSON.parse(text);
  }, {
    query: t.Object({
      date: t.Optional(t.String()),
      from: t.Optional(t.String()),
      to: t.Optional(t.String()),
      filter: t.Optional(t.String()),
      status: t.Optional(t.String()),
      limit: t.Optional(t.String()),
    }),
  })

  .post('/api/schedule', async ({ body }) => {
    const ctx = { db, sqlite, repoRoot: REPO_ROOT } as Pick<ToolContext, 'db' | 'sqlite' | 'repoRoot'>;
    const result = await handleScheduleAdd(ctx as ToolContext, body as any);
    const text = result.content[0]?.text || '{}';
    return JSON.parse(text);
  }, {
    body: t.Unknown(),
  })

  .patch('/api/schedule/:id', async ({ params, body }) => {
    const id = parseInt(params.id);
    const now = Date.now();
    db.update(schedule)
      .set({ ...(body as any), updatedAt: now })
      .where(eq(schedule.id, id))
      .run();
    return { success: true, id };
  }, {
    params: t.Object({ id: t.String() }),
    body: t.Unknown(),
  });
