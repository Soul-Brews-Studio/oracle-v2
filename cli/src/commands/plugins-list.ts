import { join } from "path";
import { homedir } from "os";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";

const ORACLE_PLUGIN_DIR = join(homedir(), ".oracle", "plugins");

interface Row {
  name: string;
  version: string;
  size: number;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
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

export async function pluginsList(_args: string[]): Promise<number> {
  if (!existsSync(ORACLE_PLUGIN_DIR)) {
    console.log(`no plugins installed (${ORACLE_PLUGIN_DIR} does not exist)`);
    return 0;
  }

  const rows: Row[] = [];
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

  if (rows.length === 0) {
    console.log("no plugins installed");
    return 0;
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));

  const nameW = Math.max(4, ...rows.map(r => r.name.length));
  const verW = Math.max(7, ...rows.map(r => r.version.length));
  const header = `${"NAME".padEnd(nameW)}  ${"VERSION".padEnd(verW)}  SIZE`;
  console.log(header);
  for (const r of rows) {
    console.log(`${r.name.padEnd(nameW)}  ${r.version.padEnd(verW)}  ${formatSize(r.size)}`);
  }
  return 0;
}
