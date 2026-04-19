import { Elysia } from 'elysia';
import { REPO_ROOT } from '../../config.ts';
import { db, sqlite } from '../../db/index.ts';
import { handleScheduleAdd } from '../../tools/schedule.ts';
import type { ToolContext } from '../../tools/types.ts';
import { createBody } from './model.ts';

export const scheduleCreateRoute = new Elysia().post('/api/schedule', async ({ body }) => {
  const ctx = { db, sqlite, repoRoot: REPO_ROOT } as Pick<ToolContext, 'db' | 'sqlite' | 'repoRoot'>;
  const result = await handleScheduleAdd(ctx as ToolContext, body as any);
  const text = result.content[0]?.text || '{}';
  return JSON.parse(text);
}, {
  body: createBody,
  detail: {
    tags: ['schedule', 'nav:hidden'],
    summary: 'Create a schedule entry',
  },
});
