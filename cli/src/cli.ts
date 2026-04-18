#!/usr/bin/env bun

import { join } from "path";
import { discoverPlugins } from "./plugin/loader.ts";
import { registerPlugins, resolveCommand, listPlugins } from "./plugin/registry.ts";
import { invokePlugin } from "./plugin/invoke.ts";
import type { LoadedPlugin } from "./plugin/types.ts";

const pkg = await Bun.file(join(import.meta.dir, "../package.json")).json();
const VERSION: string = pkg.version;

function printHelp(commands: Array<{ command: string; help?: string }>) {
  console.log(`neo-arra v${VERSION} — ARRA Oracle V3 CLI\n`);
  console.log("Usage: neo-arra <command> [args...]\n");
  console.log("Commands:");
  for (const { command, help } of commands) {
    console.log(`  ${command.padEnd(16)}${help ?? ""}`);
  }
  console.log("\nFlags:");
  console.log("  --help, -h        Show this help");
  console.log("  -h <command>      Show command help + flags");
  console.log("  --version         Show version");
}

function printCommandHelp(plugin: LoadedPlugin) {
  const cli = plugin.manifest.cli!;
  console.log(`${cli.command} — ${cli.help ?? "(no description)"}`);
  if (cli.aliases?.length) {
    console.log(`  aliases: ${cli.aliases.join(", ")}`);
  }
  if (cli.flags && Object.keys(cli.flags).length > 0) {
    console.log("\nFlags:");
    for (const [flag, desc] of Object.entries(cli.flags)) {
      console.log(`  ${flag.padEnd(20)}${desc}`);
    }
  } else {
    console.log("  (no flags)");
  }
}

async function loadAll() {
  const { plugins, bundled, user } = await discoverPlugins();
  registerPlugins(plugins);
  const total = bundled + user;
  const parts: string[] = [`${bundled} bundled`];
  if (user > 0) parts.push(`${user} user`);
  console.log(`loaded ${total} plugin${total !== 1 ? "s" : ""} (${parts.join(", ")})`);
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0]?.toLowerCase();

  if (cmd === "--version" || cmd === "version") {
    console.log(`neo-arra v${VERSION}`);
    return;
  }

  if (!cmd || cmd === "--help") {
    await loadAll();
    const commands = listPlugins()
      .filter(p => p.manifest.cli)
      .map(p => ({ command: p.manifest.cli!.command, help: p.manifest.cli!.help }));
    printHelp(commands);
    return;
  }

  if (cmd === "-h") {
    const subcmd = args[1]?.toLowerCase();
    await loadAll();
    if (!subcmd) {
      const commands = listPlugins()
        .filter(p => p.manifest.cli)
        .map(p => ({ command: p.manifest.cli!.command, help: p.manifest.cli!.help }));
      printHelp(commands);
      return;
    }
    const plugin = resolveCommand(subcmd);
    if (!plugin || !plugin.manifest.cli) {
      console.error(`unknown command: ${args[1]}`);
      process.exit(1);
    }
    printCommandHelp(plugin);
    return;
  }

  await loadAll();

  const plugin = resolveCommand(cmd);
  if (!plugin) {
    console.error(`\x1b[31m✗\x1b[0m unknown command: ${args[0]}`);
    console.error(`  run 'neo-arra --help' to see available commands`);
    process.exit(1);
  }

  const result = await invokePlugin(plugin, { source: "cli", args: args.slice(1) });
  if (result.ok && result.output) {
    console.log(result.output);
  } else if (!result.ok) {
    console.error(result.error ?? "plugin failed");
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
