/** Shared TypeBox schemas for the /api/files router tree. */
import { t } from 'elysia';

// /api/file — path/project both optional at the schema layer so the handler
// can return a specific 400 {"error":"Missing path parameter"} instead of
// Elysia's generic 422 validator error. Traversal + null-byte are enforced
// inline via t.String pattern as first-line defense; the handler re-checks
// as belt-and-suspenders.
export const fileQuery = t.Object({
  path: t.Optional(
    t.String({
      pattern: '^(?!.*\\.\\.)(?!.*\\x00).*$',
      description: 'Repo- or project-relative path. No "..", no null-byte.',
    }),
  ),
  project: t.Optional(t.String()),
});

export const readQuery = t.Object({
  file: t.Optional(t.String()),
  id: t.Optional(t.String()),
});

export const graphQuery = t.Object({
  limit: t.Optional(t.String()),
});

export const contextQuery = t.Object({
  cwd: t.Optional(t.String()),
});

export const logsQuery = t.Object({
  limit: t.Optional(t.String()),
});

export const docParams = t.Object({
  id: t.String(),
});

export const pluginParams = t.Object({
  name: t.String(),
});
