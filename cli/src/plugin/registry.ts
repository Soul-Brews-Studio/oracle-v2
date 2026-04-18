import type { LoadedPlugin } from "./types.ts";

const registry: LoadedPlugin[] = [];

export function registerPlugins(plugins: LoadedPlugin[]): void {
  registry.length = 0;
  const sorted = [...plugins].sort((a, b) => {
    const wa = a.manifest.weight ?? 50;
    const wb = b.manifest.weight ?? 50;
    return wa - wb;
  });
  registry.push(...sorted);
}

export function resolveCommand(command: string): LoadedPlugin | null {
  const cmd = command.toLowerCase();
  for (const plugin of registry) {
    if (!plugin.manifest.cli) continue;
    if (plugin.manifest.cli.command.toLowerCase() === cmd) return plugin;
    for (const alias of plugin.manifest.cli.aliases ?? []) {
      if (alias.toLowerCase() === cmd) return plugin;
    }
  }
  return null;
}

export function listPlugins(): LoadedPlugin[] {
  return [...registry];
}
