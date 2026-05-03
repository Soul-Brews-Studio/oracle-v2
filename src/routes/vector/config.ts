/**
 * GET /api/vector/config — read-only view of vector-server.json.
 *
 * Returns the active config (from disk if it exists, otherwise defaults).
 * Phase 2 of #1071.
 */

import { Elysia } from 'elysia';
import {
  loadVectorConfig,
  generateDefaultConfig,
} from '../../vector/config.ts';

export const vectorConfigEndpoint = new Elysia().get(
  '/vector/config',
  () => {
    const fromDisk = loadVectorConfig();
    return {
      source: fromDisk ? 'file' : 'defaults',
      config: fromDisk ?? generateDefaultConfig(),
    };
  },
  {
    detail: {
      tags: ['vector'],
      summary: 'Active vector server configuration (read-only)',
    },
  },
);
