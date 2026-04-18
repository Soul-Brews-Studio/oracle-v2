# Neo ARRA V3 — Autonomous Build Progress

> "Neo ARRA | Build with Oracle" — CLI with plugin system + website deploy + pluggable localhost-API backend.

**Started**: 2026-04-19 00:10 GMT+7
**Cron**: `*/30 * * * *` (every 30 min, job `6348f8be`)
**Branch**: `neo-arra-v3-build` on `Soul-Brews-Studio/arra-oracle-v3`
**Home**: two new directories alongside existing `src/` + `frontend/`:
- `cli/` → `neo-arra` CLI with plugin system (maw-js pattern)
- `web/` → Astro 5 + Tailwind 4 + CF Workers site for `neo.buildwithoracle.com` (Pigment pattern)

## Reference docs (already in vault)
- Plugin system: `ψ/learn/Soul-Brews-Studio/maw-js/2026-04-19/deep/0006_PLUGIN-SYSTEM.md`
- Web stack + pluggable backend: `ψ/learn/Soul-Brews-Studio/god-line-oracle/2026-04-19/0006_BUILD-DEPLOY-PLUGGABLE-BACKEND.md`
- maw-js reference code: `/home/nat/Code/github.com/Soul-Brews-Studio/maw-js/src/` (for CLI structure)
- Pigment reference code: `/home/nat/Code/github.com/laris-co/pigment-oracle/` (for Astro structure — read-only)

## Product shape

One product, three surfaces onto the **arra-oracle-v3 MCP server**:
1. **MCP server** (existing, in `src/`) — agents call it via stdio/HTTP
2. **CLI** (new, in `cli/`) — humans call `neo-arra search "…"` from shell
3. **Web** (new, in `web/`) — humans click in browser; connects to localhost API

CLI + Web both wrap these MCP tools: `arra_search`, `arra_learn`, `arra_list`, `arra_trace`, `arra_supersede`, `arra_concepts`, plus the 22-tool catalog.

## Roadmap

Each `- [ ]` is a cron-iteration goal. Keep chunks small enough to finish in ~25 min.

### Stage 1: Scaffold
- [x] **1.1** Create `cli/` skeleton — package.json (bin: neo-arra), tsconfig, src/index.ts entry, src/plugin/{loader,registry,manifest-validate,invoke}.ts stubs. Mirror maw-js file names.
- [x] **1.2** Create `web/` skeleton — package.json, astro.config.mjs, tsconfig.json, wrangler.json (custom_domain neo.buildwithoracle.com), wrangler.preview.json, tailwind via @tailwindcss/vite, src/pages/index.astro, src/layouts/Base.astro, src/styles/global.css.
- [x] **1.3** Create `web/src/lib/backend.ts` — `BackendClient` interface + `MockBackend` + `RealBackend(baseUrl)` + `getBackendClient()` factory. Env var `PUBLIC_BACKEND_URL`.
- [x] **1.4** Seed `cli/src/plugins/hello/` sample plugin (plugin.json + index.ts) to prove the pattern end-to-end. *(bundled with 1.1, verified: `bun run src/cli.ts hello` prints greeting)*

### Stage 2: CLI core
- [x] **2.1** Plugin loader — scan `~/.neo-arra/plugins/` + bundled, parse manifests, register commands. Emit summary line (e.g. "loaded N plugins (M bundled)").
- [x] **2.2** First 5 bundled plugins wrap MCP tools: `search`, `learn`, `list`, `trace`, `read`. Each does `fetch http://localhost:47778/api/…` (the MCP HTTP API) and prints result. Shared `cli/src/lib/api.ts` apiFetch() with NEO_ARRA_API env. All 5 verified in `--help`. *(port corrected to 47778 — real ORACLE_DEFAULT_PORT)*
- [x] **2.3** `neo-arra plugin {init|list|install|build|remove}` lifecycle commands.
- [x] **2.4** `neo-arra --version`, `--help`, `-h <command>` universal flags (mirror maw-js).

### Stage 3: Web UI
- [x] **3.1** Home page (`/`) — hero + "connect to localhost" button, status probe, 3 cards (PR #786).
- [x] **3.2** `/search` — input box, result rendering, loading/empty/error states (PR #785).
- [x] **3.3** `/learn` — form to POST a pattern via backend (PR #787).
- [x] **3.4** `/tools` — grid of 19 MCP tool cards; arra_search/learn/trace link to real pages (PR #783).
- [ ] **3.5** Style pass — Tailwind 4, dark default, Oracle family visual language.

### Stage 4: Backend adapter polish
- [ ] **4.1** Full `BackendClient` interface covers all 22 MCP tools (not just threads).
- [ ] **4.2** `RealBackend` uses standard fetch w/ retry. Handle CORS: arra-oracle-v3 MCP HTTP server needs `Access-Control-Allow-Origin: *` for localhost dev (or tailored origin).
- [ ] **4.3** Document how to run locally: start MCP server → `PUBLIC_BACKEND_URL=http://localhost:47778 bun run dev`.

### Stage 5: Deploy
- [ ] **5.1** Verify `wrangler.json` has `account_id`, `custom_domain: neo.buildwithoracle.com`, `assets.directory: ./dist`.
- [ ] **5.2** `bun run build` → dist/ pre-flight check (index.html exists, CSS > 1kb).
- [ ] **5.3** `wrangler deploy --config wrangler.preview.json` first.
- [ ] **5.4** Post-flight `curl -sI https://<preview-url>` expects 200.
- [ ] **5.5** Production deploy `wrangler deploy` (uses main wrangler.json).
- [ ] **5.6** Post-flight `curl -sI https://neo.buildwithoracle.com` expects 200.

### Stage 6: Ship + docs
- [ ] **6.1** README.md at repo root updated — 3 surfaces, install one-liners.
- [ ] **6.2** CLI install command: `bunx neo-arra` or `npm i -g neo-arra` (after publishing).
- [ ] **6.3** (obsolete — replaced by per-issue PRs throughout).
- [ ] **6.4** Morning report at `ψ/inbox/neo-arra-v3-morning-report.md` with deployed URL + install cmd + what's live + what's pending.

### Stage 7: Canvas plugin system (authorized 2026-04-19 00:40 — Nat: "make plugin and create plugable 3d!")

Plan: `ψ/plans/2026-04-19_canvas-plugin-system.md` (on arra-oracle-v3-oracle vault). Issue #772.
References being learned right now:
- Soul-Brews-Studio/maw-ui `office-8bit/` Rust→WASM pattern (scout in flight)
- Bombbaza/Multi-Planet-System-Knowledge-Map-3D as a candidate first plugin (scout in flight)

- [ ] **7.1** `/canvas` page scaffold + Three.js host container with resize handling.
- [ ] **7.2** Web Worker + OffscreenCanvas plugin runner (JS-ESM path from plan — easier authoring for v1).
- [ ] **7.3** Default demo plugin (spinning cube — proves contract works end-to-end).
- [ ] **7.4** File upload UI + manifest.json parsing (accept .js / .mjs / .zip).
- [ ] **7.5** IndexedDB local storage (`neo-arra-canvas-plugins` store).
- [ ] **7.6** `/canvas/gallery` querying `arra_list({concepts:["canvas-plugin"]})` for remote-saved plugins.
- [ ] **7.7** Permission prompt UI (opt-in per capability string).
- [ ] **7.8** Share URL pattern `?plugin=<id>` loading from IndexedDB or arra MCP.
- [ ] **7.9** Port Bombbaza's multi-planet knowledge map as reference plugin (3D knowledge graph over arra memory).
- [ ] **7.10** (v2, deferred) WASM slot mirrors maw-js Phase C — Rust/Zig path using `office-8bit` template.

## Iteration log

Each cron fire appends one line below.

| Iter | Time (GMT+7) | What | Commit |
|------|--------------|------|--------|
| 0 (seed) | 2026-04-19 00:10 | State file created, branch cut, cron scheduled | — |
| 1 | 2026-04-19 (iter-1) | cli/ scaffolded: package.json, tsconfig, cli.ts, plugin/{types,manifest,loader,registry,invoke}.ts, plugins/hello/ — `bun run src/cli.ts hello` works | 73f9e1a |
| 2 | 2026-04-19 (iter-2) | web/ scaffolded: Astro 5 + Tailwind 4 + CF Workers + BackendClient (Mock/Real) + pluggable ?api= factory — `bun run build` → dist/index.html ✓ | cd51acb |
| 3 | 2026-04-19 (iter-3) | 2.1 + 2.4 done: discoverPlugins() → {plugins,bundled,user}, startup "loaded N plugins", --version from package.json, -h <cmd> per-command help | 9559d31 |
| 4 | 2026-04-19 (iter-4) | 2.2 done: 5 bundled MCP plugins (search/learn/list/trace/read) + cli/src/lib/api.ts shared apiFetch(), verified in --help (7 plugins total), closes #770 | 4cb1cc6 |

## Rules of autonomy

- **Issues first, then PRs**: every task starts with `gh issue create`. Commits use `refs #N`; final commit per issue uses `closes #N`. PR references the issue(s).
- **Lean PRs — maw-js pattern**: target ≤200 lines per PR. One issue → one branch `feat/<issue>-<slug>` → one PR → merge → next. Never bundle multiple tasks into one mega-PR. (16 PRs in one day on maw-js CalVer day was velocity from many small units.)
- **Separate branches per task (from iter-3 onward)**: spawn teammates on SEPARATE branches (git worktree or fresh branch per task). Shared `neo-arra-v3-build` was iter-1/2 bootstrap only.
- Merge yourself (our code, our repo). Squash-merge preferred. Delete branch after merge.
- Never push to main directly. Never `--no-verify`. Never `--force`.
- `.envrc` and secrets never staged.
- If stuck: document blocker in iteration log and move to next `- [ ]`.
- When all boxes checked: write morning report at `ψ/inbox/neo-arra-v3-morning-report.md` (on arra-oracle-v3-oracle vault) + CronDelete job `6348f8be` (find via CronList).
| 3 | 2026-04-19 00:40 | Stage 3 (Web UI) LANDED: home, /search, /learn, /tools — 4 parallel worktree teammates, 4 PRs merged | 41260df |
