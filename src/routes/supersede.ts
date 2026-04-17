/**
 * Supersede Routes — /api/supersede, /api/supersede/chain (Issue #18, #19)
 *
 * Source of truth: `oracle_documents.superseded_by/at/reason` columns.
 * These are populated by `arra_supersede` MCP tool (src/tools/supersede.ts).
 * The legacy `supersede_log` table is kept for POST /api/supersede backwards
 * compatibility but is no longer the read source — it was disconnected from
 * the MCP write path (drift discovered 2026-04-16, see learning
 * `reindex-wiped-db-clits-fallback-wal-incomple` in the vault).
 */

import type { Hono } from 'hono';
import { eq, isNotNull, desc, sql, and } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { db, supersedeLog, oracleDocuments } from '../db/index.ts';

export function registerSupersedeRoutes(app: Hono) {
  // List supersessions from oracle_documents.superseded_by
  app.get('/api/supersede', (c) => {
    const project = c.req.query('project');
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');

    const projectFilter = project ? eq(oracleDocuments.project, project) : undefined;
    const whereClause = projectFilter
      ? and(isNotNull(oracleDocuments.supersededBy), projectFilter)
      : isNotNull(oracleDocuments.supersededBy);

    const countResult = db.select({ total: sql<number>`count(*)` })
      .from(oracleDocuments)
      .where(whereClause)
      .get();
    const total = countResult?.total || 0;

    // Self-join to pull the replacement doc's source_file + type
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

    return c.json({
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
    });
  });

  // Get supersede chain for a document (by source_file path)
  app.get('/api/supersede/chain/:path', (c) => {
    const docPath = decodeURIComponent(c.req.param('path'));

    // Resolve the path to a doc id first
    const target = db.select({ id: oracleDocuments.id })
      .from(oracleDocuments)
      .where(eq(oracleDocuments.sourceFile, docPath))
      .get();

    if (!target) {
      return c.json({ superseded_by: [], supersedes: [] });
    }

    const newDoc = alias(oracleDocuments, 'new_doc');

    // Docs that supersede this one (this.superseded_by → that doc)
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

    // Docs that this one supersedes (their superseded_by === target.id)
    const asNew = db.select({
      oldPath: oracleDocuments.sourceFile,
      reason: oracleDocuments.supersededReason,
      supersededAt: oracleDocuments.supersededAt,
    })
      .from(oracleDocuments)
      .where(eq(oracleDocuments.supersededBy, target.id))
      .orderBy(oracleDocuments.supersededAt)
      .all();

    return c.json({
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
    });
  });

  // Log a new supersession
  app.post('/api/supersede', async (c) => {
    try {
      const data = await c.req.json();
      if (!data.old_path) {
        return c.json({ error: 'Missing required field: old_path' }, 400);
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
        project: data.project || null
      }).returning({ id: supersedeLog.id }).get();

      return c.json({
        id: result.id,
        message: 'Supersession logged'
      }, 201);
    } catch (error) {
      return c.json({
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 500);
    }
  });
}
