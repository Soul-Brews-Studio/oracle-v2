/**
 * POST /api/supersede — append to legacy supersede_log table.
 *
 * Kept for backwards compatibility; the MCP write path populates
 * oracle_documents.superseded_by directly, not this table.
 */

import { Elysia } from 'elysia';
import { db, supersedeLog } from '../../db/index.ts';
import { SupersedeBody } from './model.ts';

export const supersedeCreateEndpoint = new Elysia().post(
  '/supersede',
  ({ body, set }) => {
    try {
      const data = (body ?? {}) as Record<string, any>;
      if (!data.old_path) {
        set.status = 400;
        return { error: 'Missing required field: old_path' };
      }

      const result = db.insert(supersedeLog).values({
        oldPath: data.old_path,
        oldId: data.old_id || null,
        oldTitle: data.old_title || null,
        oldType: data.old_type || null,
        newPath: data.new_path || null,
        newId: data.new_id || null,
        newTitle: data.new_title || null,
        reason: data.reason || null,
        supersededAt: Date.now(),
        supersededBy: data.superseded_by || 'user',
        project: data.project || null,
      }).returning({ id: supersedeLog.id }).get();

      set.status = 201;
      return {
        id: result.id,
        message: 'Supersession logged',
      };
    } catch (error) {
      set.status = 500;
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
  {
    body: SupersedeBody,
    detail: {
      tags: ['supersede', 'nav:hidden'],
      summary: 'Append to legacy supersede_log',
    },
  },
);
