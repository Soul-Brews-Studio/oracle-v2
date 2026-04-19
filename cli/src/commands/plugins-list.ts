import { join } from "path";
import { homedir } from "os";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { emit } from "./_output.ts";

const ORACLE_PLUGIN_DIR = join(homedir(), ".oracle", "plugins");

interface Row {
  name: string;
  version: string;
  size: number;
}

function readDirPlugin(dir: string, name: string): Row | null {
  const manifestPath = join(dir, "plugin.json");
  if (!existsSync(manifestPath)) return null;
  try {
    const raw = JSON.parse(readFileSync(manifestPath, "utf-8"));
    const version = typeof raw.version === "string" ? raw.version : "—";
    const wasmName = typeof raw.wasm === "string" ? raw.wasm : null;
    let size = 0;
    if (wasmName) {
      const wasmPath = join(dir, wasmName);
      if (existsSync(wasmPath)) size = statSync(wasmPath).size;
    }
    return { name, version, size };
  } catch {
    return null;
  }
}

export async function pluginsList(args: string[]): Promise<number> {
  const rows: Row[] = [];

  if (existsSync(ORACLE_PLUGIN_DIR)) {
    const entries = readdirSync(ORACLE_PLUGIN_DIR, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = join(ORACLE_PLUGIN_DIR, entry.name);
      if (entry.isDirectory()) {
        const row = readDirPlugin(entryPath, entry.name);
        if (row) rows.push(row);
      } else if (entry.isFile() && entry.name.endsWith(".wasm")) {
        const stem = entry.name.slice(0, -".wasm".length);
        const size = statSync(entryPath).size;
        rows.push({ name: stem, version: "—", size });
      }
    }
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));

  emit({ dir: ORACLE_PLUGIN_DIR, plugins: rows }, args);
  return 0;
}
