import { Elysia } from 'elysia';
import fs from 'fs';
import { SCHEDULE_PATH } from '../../config.ts';

export const scheduleMdRoute = new Elysia().get('/api/schedule/md', ({ set }) => {
  if (fs.existsSync(SCHEDULE_PATH)) {
    return fs.readFileSync(SCHEDULE_PATH, 'utf-8');
  }
  set.status = 404;
  return '';
}, {
  detail: {
    tags: ['schedule', 'nav:hidden'],
    summary: 'Raw schedule markdown',
  },
});
