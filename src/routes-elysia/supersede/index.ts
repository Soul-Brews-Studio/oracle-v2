/**
 * Supersede Routes (Elysia) — composes /api/supersede (GET/POST) + /api/supersede/chain/:path.
 */

import { Elysia } from 'elysia';
import { supersedeListEndpoint } from './supersede.ts';
import { supersedeChainEndpoint } from './chain.ts';
import { supersedeLogEndpoint } from './log.ts';

export const supersedeRoutes = new Elysia({ prefix: '/api' })
  .use(supersedeListEndpoint)
  .use(supersedeChainEndpoint)
  .use(supersedeLogEndpoint);
