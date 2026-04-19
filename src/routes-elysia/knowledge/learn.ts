/**
 * POST /api/learn — record a learning pattern.
 *
 * onError PARSE → 500 preserves Hono try/catch semantics (malformed JSON body
 * returned 500 via the old catch block; Elysia defaults to 400 for parse
 * errors, so we remap here to match the HTTP contract tests).
 */

import { Elysia } from 'elysia';
import { handleLearn } from '../../server/handlers.ts';
import { LearnBody } from './model.ts';

export const learnEndpoint = new Elysia()
  .onError(({ code, error, set }) => {
    if (code === 'PARSE') {
      set.status = 500;
      return { error: error instanceof Error ? error.message : 'Parse error' };
    }
  })
  .post(
    '/learn',
    ({ body, set }) => {
      try {
        const data = (body ?? {}) as Record<string, any>;
        if (!data.pattern) {
          set.status = 400;
          return { error: 'Missing required field: pattern' };
        }
        return handleLearn(
          data.pattern,
          data.source,
          data.concepts,
          data.origin,
          data.project,
          data.cwd,
        );
      } catch (error) {
        set.status = 500;
        return { error: error instanceof Error ? error.message : 'Unknown error' };
      }
    },
    { body: LearnBody },
  );
