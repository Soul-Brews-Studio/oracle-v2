import { Elysia } from 'elysia';
import { handleDashboardActivity } from '../../server/dashboard.ts';
import { ActivityQuery } from './model.ts';

export const activityEndpoint = new Elysia().get('/dashboard/activity', ({ query }) => {
  const parsed = parseInt(query.days ?? '7');
  const days = Number.isFinite(parsed) ? parsed : 7;
  return handleDashboardActivity(days);
}, {
  query: ActivityQuery,
  detail: {
    tags: ['dashboard', 'nav:hidden'],
    summary: 'Activity counts over N days',
  },
});
