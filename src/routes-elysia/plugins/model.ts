/** Canonical plugin scanner shared between /api/plugins and
 * /api/plugins/:name. Two layouts side-by-side:
 *   1. Nested: ~/.oracle/plugins/<name>/plugin.json + <wasm-from-manifest>
 *   2. Flat:   ~/.oracle/plugins/<name>.wasm
 *
 * Logic is identical to src/routes/plugins.ts (the Hono twin, scheduled for
 * removal once the Elysia migration wires up). During transition both exist. */
import { t } from 'elysia';
import { readdirSync, statSync, readFileSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';

export const PLUGIN_DIR = join(homedir(), '.oracle', 'plugins');

export type PluginEntry = {
  name: string;
  file: string;
  size: number;
  modified: string;
  version?: string;
  description?: string;
};

export const pluginNameParams = t.Object({ name: t.String() });

export function readNestedPlugin(
  dir: string,
  entryName: string,
): PluginEntry | null {
  const manifestPath = join(dir, 'plugin.json');
  if (!existsSync(manifestPath)) return null;
  let manifest: { name?: string; version?: string; description?: string; wasm?: string };
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
  const wasmName = manifest.wasm;
  if (!wasmName || typeof wasmName !== 'string') return null;

  // Try manifest path as-is, then fall back to basename (plugins copied flat
  // by `arra-cli plugin install` keep the source path in manifest.wasm).
  let wasmPath = join(dir, wasmName);
  let resolvedName = wasmName;
  if (!existsSync(wasmPath)) {
    const base = basename(wasmName);
    const basePath = join(dir, base);
    if (!existsSync(basePath)) return null;
    wasmPath = basePath;
    resolvedName = base;
  }
  const st = statSync(wasmPath);
  return {
    name: typeof manifest.name === 'string' && manifest.name ? manifest.name : entryName,
    file: resolvedName,
    size: st.size,
    modified: st.mtime.toISOString(),
    version: typeof manifest.version === 'string' ? manifest.version : undefined,
    description: typeof manifest.description === 'string' ? manifest.description : undefined,
  };
}

export function readFlatPlugin(file: string): PluginEntry {
  const st = statSync(join(PLUGIN_DIR, file));
  return {
    name: file.replace(/\.wasm$/, ''),
    file,
    size: st.size,
    modified: st.mtime.toISOString(),
  };
}

export function resolveWasmPath(name: string): string | null {
  const nestedManifest = join(PLUGIN_DIR, name, 'plugin.json');
  if (existsSync(nestedManifest)) {
    try {
      const manifest = JSON.parse(readFileSync(nestedManifest, 'utf8'));
      if (manifest.wasm && typeof manifest.wasm === 'string') {
        const full = join(PLUGIN_DIR, name, manifest.wasm);
        if (existsSync(full)) return full;
        const base = join(PLUGIN_DIR, name, basename(manifest.wasm));
        if (existsSync(base)) return base;
      }
    } catch {
      // fall through to flat
    }
  }
  const flat = join(PLUGIN_DIR, `${name}.wasm`);
  if (existsSync(flat)) return flat;
  return null;
}

export function scanPlugins(): { plugins: PluginEntry[]; dir: string } {
  if (!existsSync(PLUGIN_DIR)) return { plugins: [], dir: PLUGIN_DIR };
  const plugins: PluginEntry[] = [];
  for (const entry of readdirSync(PLUGIN_DIR)) {
    const fullPath = join(PLUGIN_DIR, entry);
    let st;
    try {
      st = statSync(fullPath);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      const nested = readNestedPlugin(fullPath, entry);
      if (nested) plugins.push(nested);
    } else if (st.isFile() && entry.endsWith('.wasm')) {
      plugins.push(readFlatPlugin(entry));
    }
  }
  return { plugins, dir: PLUGIN_DIR };
}
