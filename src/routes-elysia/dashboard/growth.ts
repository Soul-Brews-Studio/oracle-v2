import { Elysia } from 'elysia';
import { handleDashboardGrowth } from '../../server/dashboard.ts';
import { GrowthQuery } from './model.ts';

export const growthEndpoint = new Elysia().get('/dashboard/growth', ({ query }) => {
  const period = query.period ?? 'week';
  return handleDashboardGrowth(period);
}, {
  query: GrowthQuery,
});
