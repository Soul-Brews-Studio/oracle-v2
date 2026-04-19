/**
 * OracleNet proxy routes (Elysia) — /api/oraclenet/{feed,oracles,presence,status}
 */
import { Elysia } from 'elysia';
import { feedEndpoint } from './feed.ts';
import { oraclesEndpoint } from './oracles.ts';
import { presenceEndpoint } from './presence.ts';
import { statusEndpoint } from './status.ts';

export const oraclenetRoutes = new Elysia({ prefix: '/api/oraclenet' })
  .use(feedEndpoint)
  .use(oraclesEndpoint)
  .use(presenceEndpoint)
  .use(statusEndpoint);
