import { Elysia } from 'elysia';
import { summaryRoute } from './summary.ts';

export const sessionsRoutes = new Elysia().use(summaryRoute);
