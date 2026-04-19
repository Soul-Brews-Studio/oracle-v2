import { join } from "path";
import { homedir } from "os";
import { existsSync, readFileSync, statSync } from "fs";
import { emit } from "./_output.ts";

const ORACLE_PLUGIN_DIR = join(homedir(), ".oracle", "plugins");

async function wasmExports(wasmPath: string): Promise<
  | { exports: Array<{ kind: string; name: string }> }
  | { error: string }
> {
  try {
    const bytes = await Bun.file(wasmPath).arrayBuffer();
    const mod = await WebAssembly.compile(bytes);
    const exports = WebAssembly.Module.exports(mod);
    return { exports: exports.map(e => ({ kind: e.kind, name: e.name })) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function pluginsInfo(args: string[]): Promise<number> {
  const name = args.find(a => !a.startsWith("-"));
  if (!name) {
    console.error("usage: arra-cli plugin info <name>");
    return 1;
  }

  const dirPath = join(ORACLE_PLUGIN_DIR, name);
  const flatPath = join(ORACLE_PLUGIN_DIR, `${name}.wasm`);

  let manifest: Record<string, unknown> | null = null;
  let wasmPath: string | null = null;

  if (existsSync(dirPath) && statSync(dirPath).isDirectory()) {
    const manifestPath = join(dirPath, "plugin.json");
    if (existsSync(manifestPath)) {
      try {
        manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
      } catch (err) {
        console.error(`failed to parse ${manifestPath}: ${err instanceof Error ? err.message : String(err)}`);
        return 1;
      }
    }
    const wasmName = manifest && typeof manifest.wasm === "string" ? manifest.wasm : `${name}.wasm`;
    const candidate = join(dirPath, wasmName);
    if (existsSync(candidate)) wasmPath = candidate;
  } else if (existsSync(flatPath) && statSync(flatPath).isFile()) {
    wasmPath = flatPath;
  } else {
    console.error(`plugin '${name}' not found in ${ORACLE_PLUGIN_DIR}`);
    return 1;
  }

  const result: Record<string, unknown> = { name, manifest };

  if (wasmPath) {
    const stat = statSync(wasmPath);
    const xp = await wasmExports(wasmPath);
    result.artifact = {
      path: wasmPath,
      size: stat.size,
      modified: stat.mtime.toISOString(),
      ...xp,
    };
  } else {
    result.artifact = null;
  }

  emit(result, args);
  return 0;
}
