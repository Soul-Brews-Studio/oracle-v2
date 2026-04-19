import { Elysia } from 'elysia';
import { handleDashboardSummary } from '../../server/dashboard.ts';

export const summaryEndpoint = new Elysia()
  .get('/dashboard', () => handleDashboardSummary())
  .get('/dashboard/summary', () => handleDashboardSummary());
