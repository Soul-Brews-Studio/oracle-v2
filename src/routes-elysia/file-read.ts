/** File Read Routes (Elysia) — /api/file, /api/read
 *
 * Split from files.ts to stay under the 250-line per-file cap.
 * /api/file carries the path-traversal guard — preserve its semantics exactly.
 */
import { Elysia, t } from 'elysia';
import fs from 'fs';
import path from 'path';
import { REPO_ROOT } from '../config.ts';
import { db, sqlite } from '../db/index.ts';
import { handleRead } from '../tools/read.ts';
import { getVaultPsiRoot } from '../vault/handler.ts';
import type { ToolContext } from '../tools/types.ts';

export const fileReadRouter = new Elysia()
  // File - supports cross-repo access via ghq project paths
  .get(
    '/api/file',
    ({ query, set }) => {
      const filePath = query.path;
      const project = query.project;

      if (!filePath) {
        set.status = 400;
        return { error: 'Missing path parameter' };
      }

      // SECURITY: Block path traversal attempts
      if (filePath.includes('..') || filePath.includes('\0')) {
        set.status = 400;
        return { error: 'Invalid path: traversal not allowed' };
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
            GHQ_ROOT = match
              ? match[1]
              : path.dirname(path.dirname(path.dirname(REPO_ROOT)));
          }
        }
        const basePath = project ? path.join(GHQ_ROOT, project) : REPO_ROOT;

        // Strip project prefix if source_file already contains it
        let resolvedFilePath = filePath;
        if (
          project &&
          filePath.toLowerCase().startsWith(project.toLowerCase() + '/')
        ) {
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
        if (
          !realPath.startsWith(realGhqRoot) &&
          !realPath.startsWith(realRepoRoot)
        ) {
          set.status = 400;
          return { error: 'Invalid path: outside allowed bounds' };
        }

        if (fs.existsSync(fullPath)) {
          return new Response(fs.readFileSync(fullPath, 'utf-8'));
        }

        // Fallback: some files carry a project frontmatter tag but physically
        // live in the universal vault (REPO_ROOT / ORACLE_DATA_DIR / ψ/), not
        // in the project's ghq checkout. Try REPO_ROOT before giving up.
        if (project) {
          const repoFullPath = path.join(REPO_ROOT, filePath);
          const realRepoFullPath = path.resolve(repoFullPath);
          if (
            realRepoFullPath.startsWith(realRepoRoot) &&
            fs.existsSync(repoFullPath)
          ) {
            return new Response(fs.readFileSync(repoFullPath, 'utf-8'));
          }
        }

        const vault = getVaultPsiRoot();
        if ('path' in vault) {
          const vaultFullPath = path.join(vault.path, filePath);
          const realVaultPath = path.resolve(vaultFullPath);
          const realVaultRoot = fs.realpathSync(vault.path);
          if (
            realVaultPath.startsWith(realVaultRoot) &&
            fs.existsSync(vaultFullPath)
          ) {
            return new Response(fs.readFileSync(vaultFullPath, 'utf-8'));
          }
        }

        return new Response('File not found', { status: 404 });
      } catch (e: any) {
        return new Response(e.message, { status: 500 });
      }
    },
    {
      query: t.Object({
        path: t.Optional(t.String()),
        project: t.Optional(t.String()),
      }),
    },
  )

  .get(
    '/api/read',
    async ({ query, set }) => {
      const file = query.file;
      const id = query.id;
      if (!file && !id) {
        set.status = 400;
        return { error: 'Provide file or id parameter' };
      }
      const ctx = { db, sqlite, repoRoot: REPO_ROOT } as Pick<
        ToolContext,
        'db' | 'sqlite' | 'repoRoot'
      >;
      const result = await handleRead(ctx as ToolContext, {
        file: file || undefined,
        id: id || undefined,
      });
      const text = result.content[0]?.text || '{}';
      if (result.isError) {
        set.status = 404;
        return JSON.parse(text);
      }
      return JSON.parse(text);
    },
    {
      query: t.Object({
        file: t.Optional(t.String()),
        id: t.Optional(t.String()),
      }),
    },
  );
