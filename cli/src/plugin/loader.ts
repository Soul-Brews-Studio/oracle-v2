import { join, resolve } from "path";
import { homedir } from "os";
import { existsSync, readdirSync } from "fs";
import { parseManifest, validateManifest } from "./manifest.ts";
import type { LoadedPlugin } from "./types.ts";

const USER_PLUGIN_DIR = join(homedir(), ".neo-arra", "plugins");
const BUNDLED_PLUGIN_DIR = join(import.meta.dir, "..", "plugins");

async function loadPluginDir(dir: string): Promise<LoadedPlugin | null> {
  const manifestPath = join(dir, "plugin.json");
  if (!existsSync(manifestPath)) return null;
  try {
    const raw = await Bun.file(manifestPath).json();
    const manifest = parseManifest(raw);
    validateManifest(manifest);
    const entryPath = resolve(dir, manifest.entry);
    return { manifest, dir, entryPath };
  } catch {
    return null;
  }
}

export async function discoverPlugins(): Promise<LoadedPlugin[]> {
  const plugins: LoadedPlugin[] = [];
  const seen = new Set<string>();

  // user plugins scanned first so they override bundled plugins with the same name
  for (const baseDir of [USER_PLUGIN_DIR, BUNDLED_PLUGIN_DIR]) {
    if (!existsSync(baseDir)) continue;
    const entries = readdirSync(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const pluginDir = join(baseDir, entry.name);
      const loaded = await loadPluginDir(pluginDir);
      if (!loaded) continue;
      // user plugins override bundled by same name
      if (seen.has(loaded.manifest.name)) continue;
      seen.add(loaded.manifest.name);
      plugins.push(loaded);
    }
  }

  return plugins;
}
