/** File Routes (Elysia) — /api/{graph,context,doc/:id,logs,plugins,plugins/:name}
 *
 * /api/file and /api/read live in ./file-read.ts (split to stay under the
 * 250-line cap). Mount both routers to expose the full legacy surface.
 */
import { Elysia, t } from 'elysia';
import fs from 'fs';
import path from 'path';
import { desc } from 'drizzle-orm';
import { PLUGINS_DIR } from '../config.ts';
import { db, sqlite, searchLog } from '../db/index.ts';
import { handleGraph } from '../server/handlers.ts';
import { handleContext } from '../server/context.ts';
import { fileReadRouter } from './file-read.ts';

export const filesRouter = new Elysia()
  .use(fileReadRouter)

  .get(
    '/api/graph',
    ({ query }) => {
      const limit = query.limit ? parseInt(query.limit, 10) : undefined;
      return handleGraph(limit);
    },
    { query: t.Object({ limit: t.Optional(t.String()) }) },
  )

  .get(
    '/api/context',
    ({ query }) => handleContext(query.cwd),
    { query: t.Object({ cwd: t.Optional(t.String()) }) },
  )

  .get(
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
    { params: t.Object({ id: t.String() }) },
  )

  .get(
    '/api/logs',
    ({ query }) => {
      try {
        const limit = parseInt(query.limit || '20');
        const logs = db
          .select({
            query: searchLog.query,
            type: searchLog.type,
            mode: searchLog.mode,
            results_count: searchLog.resultsCount,
            search_time_ms: searchLog.searchTimeMs,
            created_at: searchLog.createdAt,
            project: searchLog.project,
          })
          .from(searchLog)
          .orderBy(desc(searchLog.createdAt))
          .limit(limit)
          .all();
        return { logs, total: logs.length };
      } catch {
        return { logs: [], error: 'Log table not found' };
      }
    },
    { query: t.Object({ limit: t.Optional(t.String()) }) },
  )

  .get('/api/plugins', () => {
    try {
      if (!fs.existsSync(PLUGINS_DIR)) return { plugins: [] };
      const files = fs.readdirSync(PLUGINS_DIR).filter((f) => f.endsWith('.wasm'));
      const plugins = files.map((f) => {
        const stat = fs.statSync(path.join(PLUGINS_DIR, f));
        return {
          name: f.replace('.wasm', ''),
          file: f,
          size: stat.size,
          modified: stat.mtime.toISOString(),
        };
      });
      return { plugins };
    } catch (e: any) {
      return { plugins: [], error: e.message };
    }
  })

  .get(
    '/api/plugins/:name',
    ({ params, set }) => {
      const file = params.name.endsWith('.wasm')
        ? params.name
        : `${params.name}.wasm`;
      const filePath = path.join(PLUGINS_DIR, file);
      if (!fs.existsSync(filePath)) {
        set.status = 404;
        return { error: 'Plugin not found' };
      }
      const buf = fs.readFileSync(filePath);
      return new Response(buf, {
        headers: { 'Content-Type': 'application/wasm' },
      });
    },
    { params: t.Object({ name: t.String() }) },
  );
