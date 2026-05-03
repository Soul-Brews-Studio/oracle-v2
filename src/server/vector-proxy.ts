/**
 * VectorProxy — thin HTTP client for a remote vector service (#1071 phase 1.2).
 *
 * When VECTOR_URL is set, the vector route handlers and hybrid search route
 * their vector calls through this proxy instead of calling the local
 * vector adapter (LanceDB / Chroma).
 *
 * Design goals:
 *   - One method per remote endpoint we already expose (`/api/search`,
 *     `/api/similar`, `/api/vector/stats`, `/api/vector/health`).
 *   - Every method returns `T | null`. `null` always means "remote leg
 *     unavailable" — the caller decides whether to surface FTS5-only
 *     results or to error.
 *   - 5s timeout via AbortSignal.timeout. Network errors, non-2xx, JSON
 *     parse failures, and timeouts all collapse to `null`.
 *   - Zero state. No retries, no in-process cache. Routing decisions
 *     live in the caller.
 *
 * Construction is gated by `createVectorProxy(url)` so callers can write:
 *   const proxy = createVectorProxy(VECTOR_URL);
 *   if (!proxy) { ...local adapter path... }
 */
import type { SearchResponse } from './types.ts';

const TIMEOUT_MS = 5000;

export interface VectorStatsResponse {
  vector: { enabled: boolean; count: number; collection: string };
  vectors?: Array<{
    key: string;
    model: string;
    collection: string;
    count: number;
    enabled: boolean;
  }>;
}

export interface VectorHealthResponse {
  status: 'ok' | 'degraded' | 'down';
  engines: Array<{
    key: string;
    model: string;
    collection: string;
    ok: boolean;
    error?: string;
  }>;
  checked_at: string;
}

export interface SimilarResponse {
  results: SearchResponse['results'];
  docId: string;
}

export interface VectorProxy {
  /** Hybrid search via remote — caller passes the same query params handleSearch accepts. */
  search(params: {
    q: string;
    type?: string;
    limit?: number;
    offset?: number;
    mode?: 'hybrid' | 'fts' | 'vector';
    project?: string;
    cwd?: string;
    model?: string;
  }): Promise<SearchResponse | null>;

  /** Nearest-neighbor by doc id. */
  similar(id: string, limit?: number, model?: string): Promise<SimilarResponse | null>;

  /** Per-engine collection counts. */
  stats(): Promise<VectorStatsResponse | null>;

  /** Liveness probe — true if `/api/vector/health` returns 200. */
  available(): Promise<boolean>;
}

/**
 * Build a VectorProxy bound to `baseUrl`, or return null if no URL was supplied.
 *
 * @param baseUrl — e.g. `https://vector.example.com` or empty/undefined for local mode
 */
export function createVectorProxy(baseUrl: string | undefined | null): VectorProxy | null {
  if (!baseUrl) return null;
  const base = baseUrl.replace(/\/+$/, '');

  async function fetchJson<T>(pathAndQuery: string): Promise<T | null> {
    const url = `${base}${pathAndQuery}`;
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        console.warn(`[VectorProxy] ${pathAndQuery} → HTTP ${res.status}`);
        return null;
      }
      return (await res.json()) as T;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[VectorProxy] ${pathAndQuery} failed: ${msg}`);
      return null;
    }
  }

  function qs(params: Record<string, string | number | undefined>): string {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === '') continue;
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
    return parts.length ? `?${parts.join('&')}` : '';
  }

  return {
    async search(params) {
      return fetchJson<SearchResponse>(
        `/api/search${qs({
          q: params.q,
          type: params.type,
          limit: params.limit,
          offset: params.offset,
          mode: params.mode,
          project: params.project,
          cwd: params.cwd,
          model: params.model,
        })}`,
      );
    },

    async similar(id, limit, model) {
      return fetchJson<SimilarResponse>(`/api/similar${qs({ id, limit, model })}`);
    },

    async stats() {
      return fetchJson<VectorStatsResponse>('/api/vector/stats');
    },

    async available() {
      const result = await fetchJson<VectorHealthResponse>('/api/vector/health');
      return result !== null && result.status !== 'down';
    },
  };
}
