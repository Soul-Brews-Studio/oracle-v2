/**
 * GET /api/compare — fan out search across multiple embedding models
 * server-side, return merged payload + pre-computed agreement metrics.
 *
 * Single round-trip from frontend instead of N parallel /api/search calls.
 * Phase 2 of ui-vector#5.
 */

import { Elysia, t } from 'elysia';
import { handleSearch } from '../../server/handlers.ts';
import { getEmbeddingModels } from '../../vector/factory.ts';
import { computeAgreement, type ByModel } from './agreement.ts';
import type { SearchResult } from '../../server/types.ts';

const CompareQuery = t.Object({
  q: t.Optional(t.String()),
  models: t.Optional(t.String()),
  limit: t.Optional(t.String()),
  type: t.Optional(t.String()),
  project: t.Optional(t.String()),
  cwd: t.Optional(t.String()),
});

type ByModelResponse = Record<
  string,
  { results: SearchResult[]; latency_ms: number } | { error: string }
>;

function sanitize(q: string): string {
  return q
    .replace(/<[^>]*>/g, '')
    .replace(/[\x00-\x1f]/g, '')
    .trim();
}

export const compareEndpoint = new Elysia().get(
  '/compare',
  async ({ query, set }) => {
    const q = query.q;
    if (!q) {
      set.status = 400;
      return { error: 'Missing query parameter: q' };
    }
    const sanitizedQ = sanitize(q);
    if (!sanitizedQ) {
      set.status = 400;
      return { error: 'Invalid query: empty after sanitization' };
    }

    const enabledModels = Object.keys(getEmbeddingModels());
    const requested = query.models
      ? query.models
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : enabledModels;
    // Preserve requested order but only keep known models
    const models = requested.filter((m) => enabledModels.includes(m));

    const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '20')));
    const type = query.type ?? 'all';
    const project = query.project;
    const cwd = query.cwd;

    const byModel: ByModelResponse = {};

    if (models.length === 0) {
      return {
        query: sanitizedQ,
        models: [],
        byModel,
        agreement: { top1: 0, top5_jaccard: 0, avg_rank_shift: 0, shared_ids: [] },
      };
    }

    const settled = await Promise.allSettled(
      models.map(async (model) => {
        const start = Date.now();
        const result = await handleSearch(
          sanitizedQ,
          type,
          limit,
          0,
          'vector',
          project,
          cwd,
          model,
        );
        return { model, result, latency_ms: Date.now() - start };
      }),
    );

    const successByModel: ByModel<SearchResult> = {};
    settled.forEach((r, i) => {
      const model = models[i];
      if (r.status === 'fulfilled') {
        byModel[model] = { results: r.value.result.results, latency_ms: r.value.latency_ms };
        successByModel[model] = r.value.result.results;
      } else {
        const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
        byModel[model] = { error: msg };
      }
    });

    const agreement = computeAgreement(successByModel);

    return { query: sanitizedQ, models, byModel, agreement };
  },
  {
    query: CompareQuery,
    detail: {
      tags: ['search'],
      menu: { group: 'main', order: 15 },
      summary: 'Fan out search across models + pre-computed agreement metrics',
    },
  },
);
