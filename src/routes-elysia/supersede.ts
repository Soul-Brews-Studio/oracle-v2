/**
 * Supersede Routes (Elysia) — /api/supersede, /api/supersede/chain (Issue #18, #19)
 *
 * Source of truth: `oracle_documents.superseded_by/at/reason` columns.
 * These are populated by `arra_supersede` MCP tool (src/tools/supersede.ts).
 * The legacy `supersede_log` table is kept for POST /api/supersede backwards
 * compatibility but is no longer the read source.
 */

import { Elysia, t } from 'elysia';
import { eq, isNotNull, desc, sql, and } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { db, supersedeLog, oracleDocuments } from '../db/index.ts';

export const supersedeRoutes = new Elysia({ prefix: '/api' })
  .get('/supersede', ({ query }) => {
    const project = query.project;
    const limit = parseInt(query.limit ?? '50');
    const offset = parseInt(query.offset ?? '0');

    const projectFilter = project ? eq(oracleDocuments.project, project) : undefined;
    const whereClause = projectFilter
      ? and(isNotNull(oracleDocuments.supersededBy), projectFilter)
      : isNotNull(oracleDocuments.supersededBy);

    const countResult = db.select({ total: sql<number>`count(*)` })
      .from(oracleDocuments)
      .where(whereClause)
      .get();
    const total = countResult?.total || 0;

    const newDoc = alias(oracleDocuments, 'new_doc');
    const rows = db.select({
      oldId: oracleDocuments.id,
      oldPath: oracleDocuments.sourceFile,
      oldType: oracleDocuments.type,
      newId: oracleDocuments.supersededBy,
      newPath: newDoc.sourceFile,
      newType: newDoc.type,
      reason: oracleDocuments.supersededReason,
      supersededAt: oracleDocuments.supersededAt,
      project: oracleDocuments.project,
    })
      .from(oracleDocuments)
      .leftJoin(newDoc, eq(oracleDocuments.supersededBy, newDoc.id))
      .where(whereClause)
      .orderBy(desc(oracleDocuments.supersededAt))
      .limit(limit)
      .offset(offset)
      .all();

    return {
      supersessions: rows.map(r => ({
        old_id: r.oldId,
        old_path: r.oldPath,
        old_type: r.oldType,
        new_id: r.newId,
        new_path: r.newPath,
        new_type: r.newType,
        reason: r.reason,
        superseded_at: r.supersededAt ? new Date(r.supersededAt).toISOString() : null,
        project: r.project,
      })),
      total,
      limit,
      offset,
    };
  }, {
    query: t.Object({
      project: t.Optional(t.String()),
      limit: t.Optional(t.String()),
      offset: t.Optional(t.String()),
    }),
  })
  .get('/supersede/chain/:path', ({ params }) => {
    const docPath = decodeURIComponent(params.path);

    const target = db.select({ id: oracleDocuments.id })
      .from(oracleDocuments)
      .where(eq(oracleDocuments.sourceFile, docPath))
      .get();

    if (!target) {
      return { superseded_by: [], supersedes: [] };
    }

    const newDoc = alias(oracleDocuments, 'new_doc');

    const asOld = db.select({
      newPath: newDoc.sourceFile,
      reason: oracleDocuments.supersededReason,
      supersededAt: oracleDocuments.supersededAt,
    })
      .from(oracleDocuments)
      .leftJoin(newDoc, eq(oracleDocuments.supersededBy, newDoc.id))
      .where(eq(oracleDocuments.id, target.id))
      .orderBy(oracleDocuments.supersededAt)
      .all()
      .filter(r => r.newPath !== null);

    const asNew = db.select({
      oldPath: oracleDocuments.sourceFile,
      reason: oracleDocuments.supersededReason,
      supersededAt: oracleDocuments.supersededAt,
    })
      .from(oracleDocuments)
      .where(eq(oracleDocuments.supersededBy, target.id))
      .orderBy(oracleDocuments.supersededAt)
      .all();

    return {
      superseded_by: asOld.map(r => ({
        new_path: r.newPath,
        reason: r.reason,
        superseded_at: r.supersededAt ? new Date(r.supersededAt).toISOString() : null,
      })),
      supersedes: asNew.map(r => ({
        old_path: r.oldPath,
        reason: r.reason,
        superseded_at: r.supersededAt ? new Date(r.supersededAt).toISOString() : null,
      })),
    };
  })
  .post('/supersede', ({ body, set }) => {
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
  }, {
    body: t.Any(),
  });
