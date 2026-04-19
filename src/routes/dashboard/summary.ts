import { Elysia } from 'elysia';
import { handleDashboardSummary } from '../../server/dashboard.ts';

export const summaryEndpoint = new Elysia()
  .get('/dashboard', () => handleDashboardSummary(), {
    detail: {
      tags: ['dashboard', 'nav:hidden'],
      summary: 'Dashboard summary',
    },
  })
  .get('/dashboard/summary', () => handleDashboardSummary(), {
    detail: {
      tags: ['dashboard', 'nav:hidden'],
      summary: 'Dashboard summary (alias)',
    },
  });
