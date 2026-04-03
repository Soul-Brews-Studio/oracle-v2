/** File Routes — /api/file, /api/read, /api/doc/:id, /api/context, /api/graph, /api/logs, /api/plugins */
import type { Hono } from 'hono';
import fs from 'fs';
import path from 'path';
import { desc } from 'drizzle-orm';
import { REPO_ROOT, PLUGINS_DIR } from '../config.ts';
import { db, sqlite, searchLog } from '../db/index.ts';
import { handleGraph } from '../server/handlers.ts';
import { handleRead } from '../tools/read.ts';
import { handleContext } from '../server/context.ts';
import { getVaultPsiRoot } from '../vault/handler.ts';
import type { ToolContext } from '../tools/types.ts';

export function registerFileRoutes(app: Hono) {
  // Graph
  app.get('/api/graph', (c) => {
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : undefined;
    return c.json(handleGraph(limit));
  });

  // Context
  app.get('/api/context', (c) => {
    const cwd = c.req.query('cwd');
    return c.json(handleContext(cwd));
  });

  // File - supports cross-repo access via ghq project paths
  app.get('/api/file', async (c) => {
    const filePath = c.req.query('path');
    const project = c.req.query('project'); // ghq-style path: github.com/owner/repo

    if (!filePath) {
      return c.json({ error: 'Missing path parameter' }, 400);
    }

    // SECURITY: Block path traversal attempts (check multiple encodings)
    const decodedPath = decodeURIComponent(filePath);
    const normalizedPath = path.normalize(decodedPath);

    // Block traversal patterns
    if (decodedPath.includes('..') ||
        decodedPath.includes('\\..') ||
        decodedPath.includes('%2e%2e') ||
        decodedPath.includes('%2E%2E') ||
        filePath.includes('\0') ||
        filePath.includes('\\0') ||
        normalizedPath.includes('..')) {
      return c.json({ error: 'Invalid path: traversal not allowed' }, 400);
    }

    // SECURITY: Restrict file extensions to safe types
    const safeExtensions = [
      '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
      '.md', '.txt', '.json', '.yaml', '.yml', '.toml',
      '.html', '.css', '.scss', '.less',
      '.sh', '.bash', '.zsh', '.fish',
      '.py', '.rs', '.go', '.java', '.cpp', '.c', '.h',
      '.graphql', '.gql', '.sql',
      '.env.example', '.gitignore', '.dockerignore'
    ];
    const fileExt = path.extname(normalizedPath).toLowerCase();
    const isSafeExtension = safeExtensions.includes(fileExt) || !fileExt; // Allow files without extension

    // Block sensitive files regardless of extension
    const blockedPatterns = [
      '.env', '.key', '.pem', '.cert', '.crt',
      'secret', 'private', 'password', 'credentials',
      '.npmrc', '.yarnrc', 'package-lock.json', 'yarn.lock'
    ];
    const lowerPath = normalizedPath.toLowerCase();
    const isSensitiveFile = blockedPatterns.some(pattern => lowerPath.includes(pattern));

    if (!isSafeExtension || isSensitiveFile) {
      return c.json({ error: 'File access denied: unsafe file type or sensitive file' }, 403);
    }

    try {
      // Detect GHQ_ROOT dynamically (no hardcoding)
      let GHQ_ROOT = process.env.GHQ_ROOT;
      if (!GHQ_ROOT) {
        try {
          const proc = Bun.spawnSync(['ghq', 'root']);
          GHQ_ROOT = proc.stdout.toString().trim();
        } catch {
          const match = REPO_ROOT.match(/^(.+?)\/github\.com\//);
          GHQ_ROOT = match ? match[1] : path.dirname(path.dirname(path.dirname(REPO_ROOT)));
        }
      }
      const basePath = project ? path.join(GHQ_ROOT, project) : REPO_ROOT;

      // Strip project prefix if source_file already contains it
      let resolvedFilePath = filePath;
      if (project && filePath.toLowerCase().startsWith(project.toLowerCase() + '/')) {
        resolvedFilePath = filePath.slice(project.length + 1);
      }
      const fullPath = path.join(basePath, resolvedFilePath);
      let realPath: string;
      try {
        realPath = fs.realpathSync(fullPath);
      } catch {
        realPath = path.resolve(fullPath);
      }

      const realGhqRoot = fs.realpathSync(GHQ_ROOT);
      const realRepoRoot = fs.realpathSync(REPO_ROOT);
      if (!realPath.startsWith(realGhqRoot) && !realPath.startsWith(realRepoRoot)) {
        return c.json({ error: 'Invalid path: outside allowed bounds' }, 400);
      }

      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        // Security headers for file content
        c.header('X-Content-Type-Options', 'nosniff');
        c.header('Content-Security-Policy', "default-src 'none'");
        return c.text(content);
      }

      const vault = getVaultPsiRoot();
      if ('path' in vault) {
        const vaultFullPath = path.join(vault.path, filePath);
        const realVaultPath = path.resolve(vaultFullPath);
        const realVaultRoot = fs.realpathSync(vault.path);
        if (realVaultPath.startsWith(realVaultRoot) && fs.existsSync(vaultFullPath)) {
          const content = fs.readFileSync(vaultFullPath, 'utf-8');
          return c.text(content);
        }
      }

      return c.text('File not found', 404);
    } catch (e: any) {
      return c.text(e.message, 500);
    }
  });

  app.get('/api/read', async (c) => {
    const file = c.req.query('file');
    const id = c.req.query('id');
    if (!file && !id) {
      return c.json({ error: 'Provide file or id parameter' }, 400);
    }
    const ctx = { db, sqlite, repoRoot: REPO_ROOT } as Pick<ToolContext, 'db' | 'sqlite' | 'repoRoot'>;
    const result = await handleRead(ctx as ToolContext, {
      file: file || undefined,
      id: id || undefined,
    });
    const text = result.content[0]?.text || '{}';
    if (result.isError) {
      return c.json(JSON.parse(text), 404);
    }
    return c.json(JSON.parse(text));
  });

  app.get('/api/doc/:id', (c) => {
    const docId = c.req.param('id');
    try {
      const row = sqlite.prepare(`
        SELECT d.id, d.type, d.source_file, d.concepts, d.project, f.content
        FROM oracle_documents d
        JOIN oracle_fts f ON d.id = f.id
        WHERE d.id = ?
      `).get(docId) as any;

      if (!row) {
        return c.json({ error: 'Document not found' }, 404);
      }

      return c.json({
        id: row.id,
        type: row.type,
        content: row.content,
        source_file: row.source_file,
        concepts: JSON.parse(row.concepts || '[]'),
        project: row.project
      });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  app.get('/api/logs', (c) => {
    try {
      const limit = parseInt(c.req.query('limit') || '20');
      const logs = db.select({
        query: searchLog.query,
        type: searchLog.type,
        mode: searchLog.mode,
        results_count: searchLog.resultsCount,
        search_time_ms: searchLog.searchTimeMs,
        created_at: searchLog.createdAt,
        project: searchLog.project
      })
        .from(searchLog)
        .orderBy(desc(searchLog.createdAt))
        .limit(limit)
        .all();
      return c.json({ logs, total: logs.length });
    } catch (e) {
      return c.json({ logs: [], error: 'Log table not found' });
    }
  });

  app.get('/api/plugins', (c) => {
    try {
      if (!fs.existsSync(PLUGINS_DIR)) return c.json({ plugins: [] });
      const files = fs.readdirSync(PLUGINS_DIR).filter(f => f.endsWith('.wasm'));
      const plugins = files.map(f => {
        const stat = fs.statSync(path.join(PLUGINS_DIR, f));
        return { name: f.replace('.wasm', ''), file: f, size: stat.size, modified: stat.mtime.toISOString() };
      });
      return c.json({ plugins });
    } catch (e: any) {
      return c.json({ plugins: [], error: e.message });
    }
  });

  app.get('/api/plugins/:name', (c) => {
    const name = c.req.param('name');
    const file = name.endsWith('.wasm') ? name : `${name}.wasm`;
    const filePath = path.join(PLUGINS_DIR, file);
    if (!fs.existsSync(filePath)) return c.json({ error: 'Plugin not found' }, 404);
    const buf = fs.readFileSync(filePath);
    return new Response(buf, { headers: { 'Content-Type': 'application/wasm' } });
  });
}
