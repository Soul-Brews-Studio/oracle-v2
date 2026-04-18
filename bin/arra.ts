#!/usr/bin/env bun
const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`arra-oracle-v3 — Arra Oracle HTTP server

Usage:
  bunx --bun arra-oracle-v3@github:Soul-Brews-Studio/arra-oracle-v3 [options]

Options:
  --port <n>    Port to listen on (default: 47778, env: ORACLE_PORT)
  -h, --help    Show this help

Once running, open the UI with: bunx oracle-studio`);
  process.exit(0);
}

const portIdx = args.indexOf("--port");
if (portIdx !== -1) {
  const val = args[portIdx + 1];
  if (!val || !/^\d+$/.test(val)) {
    console.error("Error: --port requires a numeric value");
    process.exit(1);
  }
  process.env.ORACLE_PORT = val;
}

const port = process.env.ORACLE_PORT || "47778";
console.log(`🔮 Arra Oracle HTTP server → http://localhost:${port}`);

await import("../src/server.ts");
