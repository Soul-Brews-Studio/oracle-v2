export interface PluginManifest {
  name: string;
  version: string;
  entry: string;
  sdk: string;
  weight?: number;
  description?: string;
  author?: string;
  cli?: {
    command: string;
    aliases?: string[];
    help?: string;
    flags?: Record<string, string>;
  };
}

export interface LoadedPlugin {
  manifest: PluginManifest;
  dir: string;
  entryPath: string;
}

export interface InvokeContext {
  source: "cli" | "api";
  args: string[];
  writer?: (...args: unknown[]) => void;
}

export interface InvokeResult {
  ok: boolean;
  output?: string;
  error?: string;
}
