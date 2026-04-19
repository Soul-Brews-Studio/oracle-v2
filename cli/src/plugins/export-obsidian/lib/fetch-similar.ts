/**
 * fetch-similar — vector nearest-neighbor client for the export-obsidian plugin.
 *
 * Part 2 of issue #933 (threader agent).
 *
 * Uses the existing `GET /api/similar?id=<docId>&limit=N&model=<m>` endpoint
 * (see `src/routes/search/similar.ts`).
 *
 * TODO(#933): switch imports to shared types once weaver's PR (part 1) lands.
 */

import { apiFetch } from "../../../lib/api.ts";
import type { SimilarResult } from "./types.ts";

export interface FetchSimilarOptions {
  /** Embedding model hint forwarded to the server (e.g. `bge-m3`). */
  model?: string;
  /** Max neighbours to request from the server before threshold filtering. */
  limit?: number;
  /** Client-side cosine-similarity cutoff (0..1). Results below are dropped. */
  threshold?: number;
}

export interface FetchSimilarBatchOptions extends FetchSimilarOptions {
  /** Optional progress callback — fired after each doc completes. */
  onProgress?: (done: number, total: number, docId: string) => void;
}

interface SimilarResponseRow {
  id: string;
  score?: number;
  type?: string;
  source_file?: string;
}
interface SimilarResponse {
  results?: SimilarResponseRow[];
  docId?: string;
}

/** Fetch neighbours for a single doc id, filtered client-side by threshold. */
export async function fetchSimilar(
  docId: string,
  opts: FetchSimilarOptions = {},
): Promise<SimilarResult[]> {
  const limit = opts.limit ?? 10;
  const threshold = opts.threshold ?? 0;
  const params = new URLSearchParams({ id: docId, limit: String(limit) });
  if (opts.model) params.set("model", opts.model);

  const res = await apiFetch(`/api/similar?${params}`);
  if (!res.ok) {
    throw new Error(`fetchSimilar: /api/similar failed (id=${docId}): HTTP ${res.status}`);
  }
  const body = (await res.json()) as SimilarResponse;
  const rows = body.results ?? [];

  const out: SimilarResult[] = [];
  for (const r of rows) {
    if (!r.id || r.id === docId) continue; // drop self-matches defensively
    const score = typeof r.score === "number" ? r.score : 0;
    if (score < threshold) continue;
    out.push({ id: r.id, score, type: r.type, source_file: r.source_file });
  }
  return out;
}

/**
 * Fetch neighbours for multiple doc ids sequentially.
 * Returns a Map keyed by input doc id → its filtered SimilarResult list.
 */
export async function fetchSimilarBatch(
  docIds: string[],
  opts: FetchSimilarBatchOptions = {},
): Promise<Map<string, SimilarResult[]>> {
  const out = new Map<string, SimilarResult[]>();
  const total = docIds.length;
  let done = 0;
  for (const id of docIds) {
    const neighbours = await fetchSimilar(id, opts);
    out.set(id, neighbours);
    done++;
    opts.onProgress?.(done, total, id);
  }
  return out;
}
