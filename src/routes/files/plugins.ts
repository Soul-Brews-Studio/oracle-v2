/** Legacy flat plugin list — only the .wasm files directly under
 * PLUGINS_DIR (ORACLE_DATA_DIR/plugins). Kept for the combined
 * mount where it shadows the canonical scanner in routes-elysia/plugins.
 * New code should prefer the canonical router. */
import { Elysia } from 'elysia';
import fs from 'fs';
import path from 'path';
import { PLUGINS_DIR } from '../../config.ts';

export const pluginsListRoute = new Elysia().get('/api/plugins', () => {
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
}, {
  detail: {
    tags: ['plugins', 'nav:hidden'],
    summary: 'Legacy flat plugin list',
  },
});
