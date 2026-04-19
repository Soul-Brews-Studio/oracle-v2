import { Elysia } from 'elysia';
import { eq } from 'drizzle-orm';
import { db, schedule } from '../../db/index.ts';
import { scheduleIdParam, updateBody } from './model.ts';

export const scheduleUpdateRoute = new Elysia().patch('/api/schedule/:id', async ({ params, body }) => {
  const id = parseInt(params.id);
  const now = Date.now();
  db.update(schedule)
    .set({ ...(body as any), updatedAt: now })
    .where(eq(schedule.id, id))
    .run();
  return { success: true, id };
}, {
  params: scheduleIdParam,
  body: updateBody,
  detail: {
    tags: ['schedule', 'nav:hidden'],
    summary: 'Update a schedule entry',
  },
});
