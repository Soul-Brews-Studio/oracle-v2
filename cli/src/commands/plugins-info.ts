import { join } from "path";
import { homedir } from "os";
import { existsSync, readFileSync, statSync } from "fs";

const ORACLE_PLUGIN_DIR = join(homedir(), ".oracle", "plugins");

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

async function printWasmExports(wasmPath: string): Promise<void> {
  try {
    const bytes = await Bun.file(wasmPath).arrayBuffer();
    const mod = await WebAssembly.compile(bytes);
    const exports = WebAssembly.Module.exports(mod);
    if (exports.length === 0) {
      console.log("  (no exports)");
      return;
    }
    for (const ex of exports) {
      console.log(`  ${ex.kind.padEnd(10)} ${ex.name}`);
    }
  } catch (err) {
    console.log(`  (failed to compile: ${err instanceof Error ? err.message : String(err)})`);
  }
}

export async function pluginsInfo(args: string[]): Promise<number> {
  const name = args.find(a => !a.startsWith("-"));
  if (!name) {
    console.error("usage: neo-arra plugin info <name>");
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

  console.log(`plugin: ${name}`);

  if (manifest) {
    console.log("\nmanifest:");
    console.log(JSON.stringify(manifest, null, 2));
  }

  if (wasmPath) {
    const stat = statSync(wasmPath);
    console.log(`\nartifact: ${wasmPath}`);
    console.log(`  size:     ${formatSize(stat.size)} (${stat.size} bytes)`);
    console.log(`  modified: ${stat.mtime.toISOString()}`);
    console.log("\nexports:");
    await printWasmExports(wasmPath);
  } else {
    console.log("\n(no .wasm artifact found)");
  }

  return 0;
}
