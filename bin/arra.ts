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

// Load server module (registers routes + plugins via Elysia setup).
// Bun's `export default { port, fetch }` auto-server pattern only fires when
// the file is the entry script. When bin/arra.ts wraps server.ts via
// `await import()`, the export becomes plain data and no listener is bound.
// Call Bun.serve() explicitly so the wrapper actually starts a server.
const { default: appSpec } = await import("../src/server.ts");
const server = Bun.serve(appSpec);
console.log(`🔮 Arra Oracle HTTP server → http://localhost:${server.port}`);
