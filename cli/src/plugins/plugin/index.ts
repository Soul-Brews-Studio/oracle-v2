import type { InvokeContext, InvokeResult } from "../../plugin/types.ts";
import { discoverPlugins } from "../../plugin/loader.ts";
import { join } from "path";
import { homedir } from "os";
import { existsSync, mkdirSync, rmSync } from "fs";

const USER_PLUGIN_DIR = join(homedir(), ".neo-arra", "plugins");

const USAGE = `neo-arra plugin — manage plugins

Usage: neo-arra plugin <subcommand> [args]

Subcommands:
  init <name>       Scaffold a new plugin in ~/.neo-arra/plugins/<name>/
  list              List all installed plugins
  install <url>     Install a plugin from a GitHub URL
  build             Build plugin in current directory (bun build)
  remove <name>     Remove an installed user plugin`;

async function cmdInit(name: string): Promise<InvokeResult> {
  if (!name) return { ok: false, error: "usage: neo-arra plugin init <name>" };
  if (!/^[a-z0-9-]+$/.test(name)) {
    return { ok: false, error: `plugin name must match /^[a-z0-9-]+$/, got: ${JSON.stringify(name)}` };
  }
  const dir = join(USER_PLUGIN_DIR, name);
  if (existsSync(dir)) {
    return { ok: false, error: `plugin '${name}' already exists at ${dir}` };
  }
  mkdirSync(dir, { recursive: true });

  const manifest = {
    name,
    version: "0.1.0",
    entry: "./index.ts",
    sdk: "^0.0.1",
    cli: { command: name, help: `${name} — custom plugin` },
  };
  await Bun.write(join(dir, "plugin.json"), JSON.stringify(manifest, null, 2) + "\n");
  await Bun.write(
    join(dir, "index.ts"),
    `import type { InvokeContext, InvokeResult } from "../../../cli/src/plugin/types.ts";\n\nexport default async function handler(_ctx: InvokeContext): Promise<InvokeResult> {\n  console.log("Hello from ${name}!");\n  return { ok: true };\n}\n`
  );
  return { ok: true, output: `✓ scaffolded '${name}' → ${dir}` };
}

async function cmdList(): Promise<InvokeResult> {
  const { plugins, bundled, user } = await discoverPlugins();
  if (!plugins.length) return { ok: true, output: "no plugins installed" };
  const lines = plugins.map(p => {
    const cmd = p.manifest.cli?.command ?? p.manifest.name;
    const ver = p.manifest.version;
    const desc = p.manifest.cli?.help ?? p.manifest.description ?? "";
    return `  ${cmd.padEnd(20)} ${ver.padEnd(10)} ${desc}`;
  });
  const summary = user > 0 ? `${bundled} bundled, ${user} user` : `${bundled} bundled`;
  return {
    ok: true,
    output: [`plugins (${plugins.length} — ${summary}):`, ...lines].join("\n"),
  };
}

async function cmdInstall(url: string): Promise<InvokeResult> {
  if (!url) return { ok: false, error: "usage: neo-arra plugin install <url>" };
  mkdirSync(USER_PLUGIN_DIR, { recursive: true });

  const name = url.split("/").pop()?.replace(/\.git$/, "") ?? "";
  if (!name || !/^[a-z0-9-]+$/.test(name)) {
    return { ok: false, error: `cannot infer valid plugin name from: ${url}` };
  }
  const dest = join(USER_PLUGIN_DIR, name);
  if (existsSync(dest)) {
    return { ok: false, error: `plugin '${name}' already installed at ${dest}` };
  }

  const proc = Bun.spawn(["git", "clone", "--depth=1", url, dest], {
    stderr: "pipe",
    stdout: "pipe",
  });
  const exit = await proc.exited;
  if (exit !== 0) {
    const err = await new Response(proc.stderr).text();
    return { ok: false, error: `git clone failed: ${err.trim()}` };
  }
  return { ok: true, output: `✓ installed '${name}' → ${dest}` };
}

async function cmdBuild(): Promise<InvokeResult> {
  const cwd = process.cwd();
  const manifestPath = join(cwd, "plugin.json");
  if (!existsSync(manifestPath)) {
    return { ok: false, error: `no plugin.json found in ${cwd}` };
  }
  const raw = await Bun.file(manifestPath).json();
  const entry = raw.entry as string;
  if (!entry) return { ok: false, error: "plugin.json missing 'entry' field" };

  const outDir = join(cwd, "dist");
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, "plugin.js");

  const proc = Bun.spawn(
    ["bun", "build", entry, "--outfile", outFile, "--target=bun"],
    { cwd, stderr: "pipe", stdout: "pipe" }
  );
  const exit = await proc.exited;
  if (exit !== 0) {
    const err = await new Response(proc.stderr).text();
    return { ok: false, error: `build failed: ${err.trim()}` };
  }
  return { ok: true, output: `✓ built → ${outFile}` };
}

function cmdRemove(name: string): InvokeResult {
  if (!name) return { ok: false, error: "usage: neo-arra plugin remove <name>" };
  const dir = join(USER_PLUGIN_DIR, name);
  if (!existsSync(dir)) {
    return { ok: false, error: `plugin '${name}' not found in ${USER_PLUGIN_DIR}` };
  }
  rmSync(dir, { recursive: true, force: true });
  return { ok: true, output: `✓ removed '${name}'` };
}

export default async function handler(ctx: InvokeContext): Promise<InvokeResult> {
  const [sub, ...rest] = ctx.args;

  switch (sub) {
    case "init":
      return cmdInit(rest[0] ?? "");
    case "list":
    case "ls":
      return cmdList();
    case "install":
      return cmdInstall(rest[0] ?? "");
    case "build":
      return cmdBuild();
    case "remove":
    case "rm":
      return cmdRemove(rest[0] ?? "");
    default:
      if (sub) console.error(`✗ unknown subcommand: ${sub}`);
      return { ok: true, output: USAGE };
  }
}
