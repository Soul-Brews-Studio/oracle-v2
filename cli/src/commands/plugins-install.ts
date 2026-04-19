import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { homedir } from "os";
import { basename, dirname, isAbsolute, join, resolve } from "path";

export interface InstallManifest {
  name: string;
  version: string;
  description?: string;
  author?: string;
  license?: string;
  wasm: string;
  build?: string;
  exports?: unknown;
}

export interface InstallOptions {
  force?: boolean;
  dryRun?: boolean;
  artifact?: string;
  manifest?: string;
}

const C = {
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
};

const GITHUB_SSH_RE = /^git@github\.com:([^/]+)\/([^/]+?)(\.git)?$/;
const NAME_RE = /^[a-z0-9-]+$/;

function pluginsRoot(): string {
  return process.env.ORACLE_PLUGIN_HOME ?? join(homedir(), ".oracle", "plugins");
}

export function parseInstallManifest(raw: string): InstallManifest {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch (e) {
    throw new Error(`invalid plugin.json: ${(e as Error).message}`);
  }
  if (!obj || typeof obj !== "object") {
    throw new Error("plugin.json must be a JSON object");
  }
  const m = obj as Record<string, unknown>;
  if (typeof m.name !== "string" || !NAME_RE.test(m.name)) {
    throw new Error(
      `plugin.json: name must match /^[a-z0-9-]+$/, got ${JSON.stringify(m.name)}`,
    );
  }
  if (typeof m.version !== "string" || m.version.length === 0) {
    throw new Error("plugin.json: version is required");
  }
  if (typeof m.wasm !== "string" || m.wasm.length === 0) {
    throw new Error("plugin.json: wasm (artifact path) is required");
  }
  if (m.build !== undefined && typeof m.build !== "string") {
    throw new Error("plugin.json: build must be a string command");
  }
  return {
    name: m.name,
    version: m.version,
    wasm: m.wasm,
    description: typeof m.description === "string" ? m.description : undefined,
    author: typeof m.author === "string" ? m.author : undefined,
    license: typeof m.license === "string" ? m.license : undefined,
    build: typeof m.build === "string" ? m.build : undefined,
    exports: m.exports,
  };
}

function isUrlLike(s: string): boolean {
  return (
    s.startsWith("http://") ||
    s.startsWith("https://") ||
    s.startsWith("github.com/") ||
    GITHUB_SSH_RE.test(s)
  );
}

function toCloneUrl(s: string): string {
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  const m = GITHUB_SSH_RE.exec(s);
  if (m) return `https://github.com/${m[1]}/${m[2]}`;
  return `https://${s}`;
}

async function ghqClone(url: string): Promise<string> {
  console.log(`${C.cyan("⚡")} cloning ${url} via ghq...`);
  const clone = Bun.spawn(["ghq", "get", "-u", url], {
    stdout: "inherit",
    stderr: "inherit",
  });
  const cloneCode = await clone.exited;
  if (cloneCode !== 0) {
    throw new Error(`ghq get failed (exit ${cloneCode})`);
  }
  const rootProc = Bun.spawn(["ghq", "root"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const rootCode = await rootProc.exited;
  if (rootCode !== 0) {
    throw new Error(`ghq root failed (exit ${rootCode})`);
  }
  const ghqRoot = (await new Response(rootProc.stdout).text()).trim();
  const repoPath = url
    .replace(/^https?:\/\//, "")
    .replace(/^git@github\.com:/, "github.com/")
    .replace(/\.git$/, "");
  const dir = join(ghqRoot, repoPath);
  if (!existsSync(dir)) {
    throw new Error(`ghq reported success but directory missing: ${dir}`);
  }
  return dir;
}

async function runBuild(cmd: string, cwd: string): Promise<void> {
  console.log(`${C.cyan("⚡")} building: ${C.dim(cmd)}`);
  const parts = cmd.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g);
  if (!parts || parts.length === 0) {
    throw new Error(`cannot parse build command: ${cmd}`);
  }
  const stripped = parts.map(p => p.replace(/^['"]|['"]$/g, ""));
  const proc = Bun.spawn(stripped, {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  if (code !== 0) throw new Error(`build failed (exit ${code})`);
}

async function downloadTo(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`download ${url} → HTTP ${res.status}`);
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, buf);
}

function synthesizeManifest(artifactUrl: string): InstallManifest {
  const raw = basename(artifactUrl).replace(/\.wasm$/i, "");
  const name = raw.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "");
  if (!NAME_RE.test(name)) {
    throw new Error(
      `cannot derive plugin name from ${artifactUrl} — pass --manifest <url>`,
    );
  }
  return { name, version: "0.0.0", wasm: basename(artifactUrl) };
}

async function installFromArtifact(opts: InstallOptions): Promise<void> {
  if (!opts.artifact) throw new Error("--artifact requires a URL");

  let manifest: InstallManifest;
  if (opts.manifest) {
    const res = await fetch(opts.manifest);
    if (!res.ok) {
      throw new Error(`manifest ${opts.manifest} → HTTP ${res.status}`);
    }
    manifest = parseInstallManifest(await res.text());
  } else {
    manifest = synthesizeManifest(opts.artifact);
    console.log(
      `${C.yellow("!")} synthesized manifest ${manifest.name}@${manifest.version} from filename`,
    );
  }

  const dest = join(pluginsRoot(), manifest.name);
  if (existsSync(dest) && !opts.force) {
    throw new Error(
      `plugin '${manifest.name}' already installed at ${dest} — use --force to overwrite`,
    );
  }

  const wasmDest = join(dest, basename(manifest.wasm));
  const manifestDest = join(dest, "plugin.json");

  if (opts.dryRun) {
    console.log(`${C.dim("[dry-run]")} would fetch ${opts.artifact} → ${wasmDest}`);
    console.log(`${C.dim("[dry-run]")} would write plugin.json → ${manifestDest}`);
    return;
  }

  if (existsSync(dest) && opts.force) {
    rmSync(dest, { recursive: true, force: true });
  }
  mkdirSync(dest, { recursive: true });
  await downloadTo(opts.artifact, wasmDest);
  writeFileSync(manifestDest, JSON.stringify(manifest, null, 2));
  console.log(
    `${C.green("✓")} installed ${manifest.name}@${manifest.version} → ${dest}`,
  );
}

async function installFromSource(source: string, opts: InstallOptions): Promise<void> {
  let src: string;
  if (isUrlLike(source)) {
    src = await ghqClone(toCloneUrl(source));
  } else {
    src = isAbsolute(source) ? source : resolve(source);
    if (!existsSync(src)) {
      throw new Error(`path not found: ${src}`);
    }
  }

  const manifestPath = join(src, "plugin.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`plugin.json not found in ${src}`);
  }
  const manifest = parseInstallManifest(readFileSync(manifestPath, "utf8"));

  const wasmPath = join(src, manifest.wasm);
  if (!existsSync(wasmPath)) {
    if (manifest.build) {
      await runBuild(manifest.build, src);
      if (!existsSync(wasmPath)) {
        throw new Error(`build ran but artifact still missing: ${wasmPath}`);
      }
    } else {
      throw new Error(
        `wasm artifact missing (${wasmPath}) and no build command in manifest`,
      );
    }
  }

  const dest = join(pluginsRoot(), manifest.name);
  if (existsSync(dest) && !opts.force) {
    throw new Error(
      `plugin '${manifest.name}' already installed at ${dest} — use --force to overwrite`,
    );
  }

  const wasmDest = join(dest, basename(manifest.wasm));
  const manifestDest = join(dest, "plugin.json");

  if (opts.dryRun) {
    console.log(`${C.dim("[dry-run]")} would copy ${wasmPath} → ${wasmDest}`);
    console.log(`${C.dim("[dry-run]")} would copy ${manifestPath} → ${manifestDest}`);
    return;
  }

  if (existsSync(dest) && opts.force) {
    rmSync(dest, { recursive: true, force: true });
  }
  mkdirSync(dest, { recursive: true });
  copyFileSync(wasmPath, wasmDest);
  copyFileSync(manifestPath, manifestDest);
  console.log(
    `${C.green("✓")} installed ${manifest.name}@${manifest.version} → ${dest}`,
  );
}

export async function doInstall(
  source: string | undefined,
  opts: InstallOptions,
): Promise<void> {
  if (opts.artifact) {
    await installFromArtifact(opts);
    return;
  }
  if (!source) {
    throw new Error(
      "missing <url-or-path>; see 'neo-arra plugin install --help'",
    );
  }
  await installFromSource(source, opts);
}

export function printInstallHelp(): void {
  console.log("neo-arra plugin install <url-or-path> [flags]");
  console.log("");
  console.log("Sources:");
  console.log("  https://github.com/owner/repo");
  console.log("  github.com/owner/repo");
  console.log("  git@github.com:owner/repo.git");
  console.log("  ./local/path");
  console.log("");
  console.log("Flags:");
  console.log("  --force              overwrite existing install");
  console.log("  --dry-run            show what would happen, do nothing");
  console.log("  --artifact <url>     download prebuilt .wasm directly (skip clone+build)");
  console.log("  --manifest <url>     plugin.json URL to pair with --artifact");
  console.log("                       (if omitted, manifest is synthesized from filename)");
  console.log("  -h, --help           show this help");
}

export async function runInstallCli(args: string[]): Promise<number> {
  const opts: InstallOptions = {};
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--force" || a === "-f") {
      opts.force = true;
    } else if (a === "--dry-run") {
      opts.dryRun = true;
    } else if (a === "--artifact") {
      const v = args[++i];
      if (!v) {
        console.error(`${C.red("✗")} --artifact requires a value`);
        return 1;
      }
      opts.artifact = v;
    } else if (a === "--manifest") {
      const v = args[++i];
      if (!v) {
        console.error(`${C.red("✗")} --manifest requires a value`);
        return 1;
      }
      opts.manifest = v;
    } else if (a === "-h" || a === "--help") {
      printInstallHelp();
      return 0;
    } else if (a.startsWith("--") || a.startsWith("-")) {
      console.error(`${C.red("✗")} unknown flag: ${a}`);
      return 1;
    } else {
      positional.push(a);
    }
  }

  try {
    await doInstall(positional[0], opts);
    return 0;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`${C.red("✗")} ${msg}`);
    return 1;
  }
}
