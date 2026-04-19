/**
 * Knowledge Routes (Elysia) — composes /api/{learn,handoff,inbox}.
 */

import { Elysia } from 'elysia';
import { learnEndpoint } from './learn.ts';
import { handoffEndpoint } from './handoff.ts';
import { inboxEndpoint } from './inbox.ts';

export const knowledgeRoutes = new Elysia({ prefix: '/api' })
  .use(learnEndpoint)
  .use(handoffEndpoint)
  .use(inboxEndpoint);
