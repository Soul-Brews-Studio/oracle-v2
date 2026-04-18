# Changelog

All notable changes to the **Neo ARRA V3** consumer surface (CLI + Web + pluggable localhost backend).

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and CalVer (`vYY.M.D[-alpha.N]`).

## [Unreleased]

### Added — Neo ARRA V3 | Build with Oracle

The MCP server (this repo, `src/`) now has two new consumer surfaces:

- **`cli/`** — `neo-arra` CLI with a maw-js-style plugin system.
  - Plugin loader (`cli/src/plugin/loader.ts`) scans bundled (`cli/src/plugins/`) + user (`~/.neo-arra/plugins/`) plugins. Emits startup line `loaded N plugins (M bundled, K user)`. (#769)
  - Universal flags `--version`, `--help`, `-h <command>`. (#769)
  - 5 bundled plugins wrapping MCP HTTP API: `search`, `learn`, `list`, `trace`, `read`. Shared helper `cli/src/lib/api.ts` with `NEO_ARRA_API` env var (default `http://localhost:47778`, the real `ORACLE_DEFAULT_PORT`). (#770)
  - `neo-arra plugin {init|list|install|build|remove}` lifecycle commands. `remove` archives to `/tmp/neo-arra-removed-<name>-<ts>/` before unlinking — Principle 1: Nothing is Deleted. (#771)
  - Sample plugin `cli/src/plugins/hello/` proves the pattern end-to-end.

- **`web/`** — Astro 5 + Tailwind 4 + Cloudflare Workers site for `neo.buildwithoracle.com` (Pigment pattern, _not_ CF Pages).
  - `web/src/lib/backend.ts` — `BackendClient` interface with `MockBackend` + `RealBackend(baseUrl)` implementations. Selected by `PUBLIC_BACKEND_URL` env var or `?api=http://localhost:47778` query param (drizzle.studio style). (#773)
  - `wrangler.json` routes `neo.buildwithoracle.com` as custom domain with `assets.directory: "./dist"`. Preview via `wrangler.preview.json`.
  - `bun run build` produces static `dist/` with `index.html` + compiled Tailwind CSS.

### Planned (issues filed, implementation gated)

- **#772** Canvas plugin system — Three.js 2D/3D widgets uploadable as Web Worker + OffscreenCanvas (JS v1) or WASM (v2). Plan: `ψ/plans/2026-04-19_canvas-plugin-system.md` on the arra-oracle-v3-oracle vault.

### Process notes (new for this cycle)

- **Issues-first workflow**: every task starts with a filed issue; commits use `refs #N` / final commit `closes #N`; PRs reference and close issues.
- **Lean PRs (maw-js discipline)**: target ≤200 lines/PR. One-issue-one-branch-one-PR. Never bundle.
- **Autonomous build loop**: `BUILD-PROGRESS.md` is the state file; `cron 6348f8be` fires every 30 minutes to pick the next unchecked item.

### PRs merged in this cycle

- #773 `feat: scaffold cli/ + web/ directories for Neo ARRA V3 surfaces` (bootstrap — scaffolding boilerplate, ~1.6k lines generated)
- #774 `feat(cli): plugin loader + universal flags` (86 lines, closes #769)
- #775 `feat(cli): 5 bundled MCP plugins + api helper` (347 lines, closes #770)
- #776 `feat(cli): plugin lifecycle subcommands (init|list|install|build|remove)` (154 lines, closes #771)
