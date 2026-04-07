/**
 * Oracle List Handler
 *
 * List documents without search query, with pagination and type filtering.
 */

import { eq, sql } from 'drizzle-orm';
import { oracleDocuments } from '../db/schema.ts';
import type { ToolContext, ToolResponse, OracleListInput } from './types.ts';

export const listToolDef = {
  name: 'arra_list',
  description: 'List all documents in Oracle knowledge base. Browse without searching - useful for exploring what knowledge exists. Supports pagination and type filtering.',
  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['principle', 'pattern', 'learning', 'retro', 'all'],
        description: 'Filter by document type',
        default: 'all'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of documents to return (1-100)',
        default: 10
      },
      offset: {
        type: 'number',
        description: 'Number of documents to skip (for pagination)',
        default: 0
      }
    },
    required: []
  }
};

export async function handleList(ctx: ToolContext, input: OracleListInput): Promise<ToolResponse> {
  const { type = 'all', limit = 10, offset = 0 } = input;

  if (limit < 1 || limit > 100) {
    throw new Error('limit must be between 1 and 100');
  }
  if (offset < 0) {
    throw new Error('offset must be >= 0');
  }

  const validTypes = ['principle', 'pattern', 'learning', 'retro', 'all'];
  if (!validTypes.includes(type)) {
    throw new Error(`Invalid type: ${type}. Must be one of: ${validTypes.join(', ')}`);
  }

  // TTL filter: exclude expired documents (Issue #4)
  const nowMs = Date.now();

  const countResult = type === 'all'
    ? ctx.sqlite.prepare('SELECT count(*) as total FROM oracle_documents WHERE (expires_at IS NULL OR expires_at > ?)').get(nowMs) as { total: number }
    : ctx.sqlite.prepare('SELECT count(*) as total FROM oracle_documents WHERE type = ? AND (expires_at IS NULL OR expires_at > ?)').get(type, nowMs) as { total: number };
  const total = countResult?.total ?? 0;

  const expiredResult = ctx.sqlite.prepare('SELECT count(*) as cnt FROM oracle_documents WHERE expires_at IS NOT NULL AND expires_at <= ?').get(nowMs) as { cnt: number };
  const expiredCount = expiredResult?.cnt ?? 0;

  const listStmt = type === 'all'
    ? ctx.sqlite.prepare(`
        SELECT d.id, d.type, d.source_file, d.concepts, d.indexed_at, f.content
        FROM oracle_documents d
        JOIN oracle_fts f ON d.id = f.id
        WHERE (d.expires_at IS NULL OR d.expires_at > ?)
        ORDER BY d.indexed_at DESC
        LIMIT ? OFFSET ?
      `)
    : ctx.sqlite.prepare(`
        SELECT d.id, d.type, d.source_file, d.concepts, d.indexed_at, f.content
        FROM oracle_documents d
        JOIN oracle_fts f ON d.id = f.id
        WHERE d.type = ? AND (d.expires_at IS NULL OR d.expires_at > ?)
        ORDER BY d.indexed_at DESC
        LIMIT ? OFFSET ?
      `);

  const rows = type === 'all'
    ? listStmt.all(nowMs, limit, offset)
    : listStmt.all(type, nowMs, limit, offset);

  const documents = (rows as any[]).map((row) => ({
    id: row.id,
    type: row.type,
    title: row.content.split('\n')[0].substring(0, 80),
    content: row.content.substring(0, 500),
    source_file: row.source_file,
    concepts: JSON.parse(row.concepts || '[]'),
    indexed_at: row.indexed_at,
  }));

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ documents, total, limit, offset, type, expired: expiredCount }, null, 2)
    }]
  };
}
