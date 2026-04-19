/**
 * Knowledge Routes (Elysia) — /api/learn, /api/handoff, /api/inbox
 */

import { Elysia, t } from 'elysia';
import fs from 'fs';
import path from 'path';
import { REPO_ROOT } from '../config.ts';
import { handleLearn } from '../server/handlers.ts';

export const knowledgeRoutes = new Elysia({ prefix: '/api' })
  .onError(({ code, error, set }) => {
    if (code === 'PARSE') {
      set.status = 500;
      return { error: error instanceof Error ? error.message : 'Parse error' };
    }
  })
  .post('/learn', ({ body, set }) => {
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
  }, {
    body: t.Any(),
  })
  .post('/handoff', ({ body, set }) => {
    try {
      const data = (body ?? {}) as Record<string, any>;
      if (!data.content) {
        set.status = 400;
        return { error: 'Missing required field: content' };
      }

      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;

      const slug = data.slug || data.content
        .substring(0, 50)
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'handoff';

      const filename = `${dateStr}_${timeStr}_${slug}.md`;
      const dirPath = path.join(REPO_ROOT, 'ψ/inbox/handoff');
      const filePath = path.join(dirPath, filename);

      fs.mkdirSync(dirPath, { recursive: true });
      fs.writeFileSync(filePath, data.content, 'utf-8');

      set.status = 201;
      return {
        success: true,
        file: `ψ/inbox/handoff/${filename}`,
        message: 'Handoff written.',
      };
    } catch (error) {
      set.status = 500;
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }, {
    body: t.Any(),
  })
  .get('/inbox', ({ query }) => {
    const limit = parseInt(query.limit ?? '10');
    const offset = parseInt(query.offset ?? '0');
    const type = query.type ?? 'all';

    const inboxDir = path.join(REPO_ROOT, 'ψ/inbox');
    const results: Array<{ filename: string; path: string; created: string; preview: string; type: string }> = [];

    if (type === 'all' || type === 'handoff') {
      const handoffDir = path.join(inboxDir, 'handoff');
      if (fs.existsSync(handoffDir)) {
        const files = fs.readdirSync(handoffDir)
          .filter(f => f.endsWith('.md'))
          .sort()
          .reverse();

        for (const file of files) {
          const filePath = path.join(handoffDir, file);
          const content = fs.readFileSync(filePath, 'utf-8');
          const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2})/);
          const created = dateMatch
            ? `${dateMatch[1]}T${dateMatch[2].replace('-', ':')}:00`
            : 'unknown';

          results.push({
            filename: file,
            path: `ψ/inbox/handoff/${file}`,
            created,
            preview: content.substring(0, 500),
            type: 'handoff',
          });
        }
      }
    }

    const total = results.length;
    const paginated = results.slice(offset, offset + limit);

    return { files: paginated, total, limit, offset };
  }, {
    query: t.Object({
      limit: t.Optional(t.String()),
      offset: t.Optional(t.String()),
      type: t.Optional(t.String()),
    }),
  });
