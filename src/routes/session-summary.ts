/**
 * Session Summary Route — POST /api/session/:id/summary
 *
 * Writes the summary as a learning document with concepts
 *   ["session-summary", "session-<id>", "oracle-<name>"]
 * so `arra_search` surfaces session summaries naturally.
 *
 * Lives in a separate file from src/routes/sessions.ts (red's territory) to avoid
 * merge conflicts while #437 parts A–E land.
 */

import type { Hono } from 'hono';
import { handleSessionSummary } from '../server/handlers.ts';

const MAX_SUMMARY_CHARS = 4000;

export function registerSessionSummaryRoutes(app: Hono) {
  app.post('/api/session/:id/summary', async (c) => {
    try {
      const sessionId = c.req.param('id');
      if (!sessionId) {
        return c.json({ error: 'Missing session id' }, 400);
      }

      const body = await c.req.json().catch(() => null) as
        | { summary?: unknown; oracle?: unknown }
        | null;
      if (!body) {
        return c.json({ error: 'Invalid JSON body' }, 400);
      }

      const { summary, oracle } = body;
      if (typeof summary !== 'string' || summary.trim().length === 0) {
        return c.json({ error: 'Missing required field: summary' }, 400);
      }
      if (summary.length > MAX_SUMMARY_CHARS) {
        return c.json(
          { error: `summary exceeds max length (${MAX_SUMMARY_CHARS} chars)` },
          400,
        );
      }
      if (oracle !== undefined && typeof oracle !== 'string') {
        return c.json({ error: 'oracle must be a string' }, 400);
      }

      const result = handleSessionSummary(sessionId, summary, oracle);
      return c.json(result, 201);
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : 'Unknown error' },
        500,
      );
    }
  });
}
