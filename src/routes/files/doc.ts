import { Elysia } from 'elysia';
import { sqlite } from '../../db/index.ts';
import { docParams } from './model.ts';

export const docRoute = new Elysia().get(
  '/api/doc/:id',
  ({ params, set }) => {
    try {
      const row = sqlite
        .prepare(
          `
        SELECT d.id, d.type, d.source_file, d.concepts, d.project, f.content
        FROM oracle_documents d
        JOIN oracle_fts f ON d.id = f.id
        WHERE d.id = ?
      `,
        )
        .get(params.id) as any;

      if (!row) {
        set.status = 404;
        return { error: 'Document not found' };
      }

      return {
        id: row.id,
        type: row.type,
        content: row.content,
        source_file: row.source_file,
        concepts: JSON.parse(row.concepts || '[]'),
        project: row.project,
      };
    } catch (e: any) {
      set.status = 500;
      return { error: e.message };
    }
  },
  {
    params: docParams,
    detail: {
      tags: ['files', 'nav:hidden'],
      summary: 'Get one oracle document by id',
    },
  },
);
