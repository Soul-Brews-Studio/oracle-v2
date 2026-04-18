/**
 * Plugin Routes — /api/plugins, /api/plugins/:name
 *
 * Serves WASM plugins from ~/.oracle/plugins/*.wasm for the studio's
 * /plugins page. Single-user, local-only — no auth.
 */

import type { Hono } from 'hono';
import { readdirSync, statSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const PLUGIN_DIR = join(homedir(), '.oracle', 'plugins');

export function registerPluginRoutes(app: Hono) {
  app.get('/api/plugins', (c) => {
    if (!existsSync(PLUGIN_DIR)) {
      return c.json({ plugins: [], dir: PLUGIN_DIR });
    }
    const plugins = readdirSync(PLUGIN_DIR)
      .filter((f) => f.endsWith('.wasm'))
      .map((file) => {
        const st = statSync(join(PLUGIN_DIR, file));
        return {
          name: file.replace(/\.wasm$/, ''),
          file,
          size: st.size,
          modified: st.mtime.toISOString(),
        };
      });
    return c.json({ plugins, dir: PLUGIN_DIR });
  });

  app.get('/api/plugins/:name', (c) => {
    const name = c.req.param('name').replace(/[^\w.-]/g, '');
    const file = name.endsWith('.wasm') ? name : `${name}.wasm`;
    const path = join(PLUGIN_DIR, file);
    if (!existsSync(path)) {
      return c.json({ error: 'plugin not found', name }, 404);
    }
    const bytes = readFileSync(path);
    return new Response(bytes, {
      headers: { 'content-type': 'application/wasm' },
    });
  });
}
