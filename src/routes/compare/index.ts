/**
 * Compare routes (Elysia) — composes /api/compare.
 */

import { Elysia } from 'elysia';
import { compareEndpoint } from './compare.ts';

export const compareRoutes = new Elysia({ prefix: '/api' }).use(compareEndpoint);
