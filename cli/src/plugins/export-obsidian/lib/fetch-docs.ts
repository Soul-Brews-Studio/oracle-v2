/**
 * fetch-docs — paginated /api/list client for the export-obsidian plugin.
 *
 * Part 2 of issue #933 (threader agent).
 *
 * TODO(#933): switch imports to shared types once weaver's PR (part 1) lands.
 */

import { apiFetch } from "../../../lib/api.ts";
import type { ApiDoc } from "./types.ts";

const PAGE_SIZE = 100;

export interface FetchDocsOptions {
  /** Document types to include. Omit or pass empty array for all types. */
  types?: string[];
  /** Optional project glob — matched client-side against `ApiDoc.project`. */
  project?: string;
}

interface ListResponse {
  results?: ApiDoc[];
  total?: number;
  offset?: number;
  limit?: number;
}

/**
 * Fetch all documents matching the given filters, paginating until exhausted.
 *
 * - For each requested type (or a single "all" pass when `types` is omitted),
 *   walks `/api/list?type=X&offset=N&limit=100` until the server returns
 *   fewer results than `PAGE_SIZE` (or zero).
 * - Applies the project glob client-side — the server does not filter on project.
 */
export async function fetchAllDocs(opts: FetchDocsOptions = {}): Promise<ApiDoc[]> {
  const types = opts.types && opts.types.length > 0 ? opts.types : ["all"];
  const projectMatcher = opts.project ? globToRegex(opts.project) : null;

  const out: ApiDoc[] = [];
  const seen = new Set<string>();

  for (const type of types) {
    let offset = 0;
    // Hard cap to protect against runaway loops if the API misreports counts.
    for (let guard = 0; guard < 10_000; guard++) {
      const params = new URLSearchParams({
        type,
        offset: String(offset),
        limit: String(PAGE_SIZE),
      });
      const res = await apiFetch(`/api/list?${params}`);
      if (!res.ok) {
        throw new Error(`fetchAllDocs: /api/list failed (type=${type}, offset=${offset}): HTTP ${res.status}`);
      }
      const body = (await res.json()) as ListResponse;
      const page = body.results ?? [];
      for (const doc of page) {
        if (seen.has(doc.id)) continue;
        if (projectMatcher && !projectMatcher.test(doc.project ?? "")) continue;
        seen.add(doc.id);
        out.push(doc);
      }
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  }

  return out;
}

/**
 * Convert a simple glob (`*`, `?`) into a case-sensitive RegExp anchored on both ends.
 * Escapes all other regex metacharacters.
 */
function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}
