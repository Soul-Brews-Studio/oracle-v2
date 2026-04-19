/**
 * GET /api/supersede/chain/:path — forward + backward chain for one doc.
 */

import { Elysia } from 'elysia';
import { eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { db, oracleDocuments } from '../../db/index.ts';

export const supersedeChainEndpoint = new Elysia().get(
  '/supersede/chain/:path',
  ({ params }) => {
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
  },
  {
    detail: {
      tags: ['supersede', 'nav:tools', 'order:70'],
      summary: 'Supersession chain for a doc path',
    },
  },
);
