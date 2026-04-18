#!/usr/bin/env bun

import { discoverPlugins } from "./plugin/loader.ts";
import { registerPlugins, resolveCommand, listPlugins } from "./plugin/registry.ts";
import { invokePlugin } from "./plugin/invoke.ts";

const VERSION = "0.0.1";

function printHelp(commands: Array<{ command: string; help?: string }>) {
  console.log(`neo-arra v${VERSION} — ARRA Oracle V3 CLI\n`);
  console.log("Usage: neo-arra <command> [args...]\n");
  console.log("Commands:");
  for (const { command, help } of commands) {
    const pad = command.padEnd(16);
    console.log(`  ${pad}${help ?? ""}`);
  }
  console.log("\nFlags:");
  console.log("  --help, -h    Show this help");
  console.log("  --version     Show version");
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0]?.toLowerCase();

  if (!cmd || cmd === "--help" || cmd === "-h") {
    const plugins = await discoverPlugins();
    registerPlugins(plugins);
    const commands = listPlugins()
      .filter(p => p.manifest.cli)
      .map(p => ({ command: p.manifest.cli!.command, help: p.manifest.cli!.help }));
    printHelp(commands);
    return;
  }

  if (cmd === "--version" || cmd === "version") {
    console.log(`neo-arra v${VERSION}`);
    return;
  }

  const plugins = await discoverPlugins();
  registerPlugins(plugins);

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
