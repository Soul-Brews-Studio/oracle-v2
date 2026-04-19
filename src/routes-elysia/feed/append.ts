import { Elysia } from 'elysia';
import fs from 'fs';
import os from 'os';
import { FEED_LOG } from '../../config.ts';
import { authGuard } from './guard.ts';
import { AppendFeedBody } from './model.ts';

export const appendFeedRoute = new Elysia()
  .use(authGuard)
  .post('/', async ({ body, set }) => {
    try {
      const { oracle, event, project, session_id, message } = body;

      if (!oracle || !event) {
        set.status = 400;
        return { error: 'Missing required fields: oracle, event' };
      }

      const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const host = os.hostname();
      const line = `${timestamp} | ${oracle} | ${host} | ${event} | ${project || ''} | ${session_id || ''} » ${message || ''}\n`;

      fs.appendFileSync(FEED_LOG, line);
      return { success: true, timestamp };
    } catch (e: any) {
      set.status = 500;
      return { error: e.message };
    }
  }, {
    body: AppendFeedBody,
  });
