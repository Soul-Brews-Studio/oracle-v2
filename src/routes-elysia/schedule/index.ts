import { Elysia } from 'elysia';
import { scheduleMdRoute } from './md.ts';
import { scheduleListRoute } from './list.ts';
import { scheduleCreateRoute } from './create.ts';
import { scheduleUpdateRoute } from './update.ts';

export const scheduleApi = new Elysia()
  .use(scheduleMdRoute)
  .use(scheduleListRoute)
  .use(scheduleCreateRoute)
  .use(scheduleUpdateRoute);
