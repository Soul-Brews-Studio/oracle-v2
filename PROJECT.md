# PROJECT.md — arra-oracle-v3

## What & Why
**One-liner:** TypeScript MCP server for semantic search over Oracle philosophy — hybrid FTS5 + vector search, HTTP API, OAuth 2.1, and vault CLI
**Status:** active
**Owner:** OpenClaw (Soul-Brews-Studio)

## Problem
- AI agents lose knowledge between sessions — no persistent semantic memory
- oracle-v2 used ChromaDB which was unstable (hangs, timeouts); needed pluggable vector backend
- Remote MCP access needed OAuth 2.1 for Claude Desktop (no custom headers support)

## Users
- PSak, Dora, and other AI agents via MCP (stdio + Streamable HTTP)
- Claude Desktop via OAuth 2.1 + PKCE
- soul-orchestra scores that need cross-agent knowledge sharing

## Requirements (Living)

### Must Have (P0)
- [x] 19 arra_* MCP tools (search, read, learn, threads, traces, handoff, inbox)
- [x] Hybrid FTS5 + vector search with graceful degradation
- [x] Streamable HTTP MCP transport at /mcp
- [x] OAuth 2.1 + PKCE for Claude Desktop
- [x] Project scoping (agent:psak private vs shared)

### Should Have (P1)
- [x] Forum/threads system for multi-turn discussions
- [x] Trace chains for reasoning provenance
- [x] Vault CLI for managing knowledge vault
- [ ] Automated vault indexing on file change

### Nice to Have (P2)
- [ ] Oracle Studio React dashboard integration
- [ ] Multi-tenant support beyond agent scoping
<!-- AUTO-GEN:BEGIN — Do not edit manually. Run: gen-ai-context.sh --update -->
## Architecture (Brief)

- **Stack:** Node.js
- **Entry points:** src/index.ts, npm start → bun dist/index.js, src/index.ts

## Context Map

| Task Type | Read These First |
|-----------|-----------------|
| API/endpoints | `src/routes/` |
| Database | `src/db/` |
| Tests | `tests/` |
| Documentation | `docs/` |
| Scripts/CLI | `scripts/` |
| Deploy/CI | `.github/workflows/` |
| e2e | `e2e/` |
| frontend | `frontend/` |

## Exports

### API Endpoints

```
src/oauth/routes.ts:32:  app.get('/.well-known/oauth-authorization-server', (c) => {
src/oauth/routes.ts:47:  app.get('/.well-known/oauth-protected-resource', (c) => {
src/oauth/routes.ts:59:  app.post('/register', async (c) => {
src/oauth/routes.ts:97:  app.get('/authorize', (c) => {
src/oauth/routes.ts:131:  app.post('/token', async (c) => {
src/oauth/routes.ts:178:  app.post('/revoke', async (c) => {
src/oauth/routes.ts:205:  app.get('/oauth/login', (c) => {
src/oauth/routes.ts:212:  app.post('/oauth/callback', async (c) => {
src/routes/settings.ts:10:  app.get('/api/settings', (c) => {
src/routes/settings.ts:25:  app.post('/api/settings', async (c) => {
src/routes/forum.ts:16:  app.get('/api/threads', (c) => {
src/routes/forum.ts:36:  app.post('/api/thread', async (c) => {
src/routes/forum.ts:63:  app.get('/api/thread/:id', (c) => {
src/routes/forum.ts:95:  app.patch('/api/thread/:id/status', async (c) => {
src/routes/traces.ts:16:  app.get('/api/traces', (c) => {
src/routes/traces.ts:34:  app.get('/api/traces/:id', (c) => {
src/routes/traces.ts:45:  app.get('/api/traces/:id/chain', (c) => {
src/routes/traces.ts:54:  app.post('/api/traces/:prevId/link', async (c) => {
src/routes/traces.ts:77:  app.delete('/api/traces/:id/link', async (c) => {
src/routes/traces.ts:100:  app.get('/api/traces/:id/linked-chain', async (c) => {
```

### npm Scripts

- `npm run dev` → bun src/index.ts
- `npm run server` → bun src/server.ts
- `npm run server:ensure` → bun src/ensure-server.ts
- `npm run server:status` → bun src/ensure-server.ts --status
- `npm run serve` → bun dist/server.js
- `npm run index` → bun src/indexer/cli.ts
- `npm run build` → tsc --noEmit
- `npm run start` → bun dist/index.js
- `npm run test` → bun run test:unit && bun run test:integration
- `npm run test:unit` → bun test src/tools/__tests__/ src/server/__tests__/ src/vault/__tests__/ src/drizzle-migration.test.ts src/indexer-preservation.test.ts
<!-- AUTO-GEN:END -->

## Key Decisions

| Decision | เลือก | ไม่เลือก | ทำไม |
|----------|-------|---------|------|
| Vector backend | Qdrant Cloud (prod), LanceDB (dev) | ChromaDB | ChromaDB hang/timeout บ่อย, Qdrant เสถียรกว่า + managed cloud |
| Runtime | Bun >= 1.2.0 | Node.js | เร็วกว่า, built-in SQLite, TypeScript first-class |
| ORM | Drizzle | Prisma, raw SQL | type-safe + lightweight + SQLite FTS5 support ดี |
| Auth | OAuth 2.1 + PKCE + static Bearer | API key only | Claude Desktop ไม่รองรับ custom headers ต้องใช้ OAuth flow |
| MCP transport | stdio + Streamable HTTP | SSE | Streamable HTTP เป็น standard ใหม่ของ MCP, SSE deprecated |

## Constraints & Gotchas

- Port 47778 hardcoded — shared with oracle-v2 (only one can run at a time)
- Qdrant Cloud latency ~100-200ms per query — FTS5 handles fallback if vector backend is down
- Must run `bun run index` before first use to populate SQLite FTS5
- OAuth flow requires `MCP_OAUTH_PIN` env var; Bearer auth requires `MCP_AUTH_TOKEN`
- Package name in package.json is still `arra-oracle-v2` (historical artifact)

---

*Human sections: What & Why, Problem, Users, Requirements, Key Decisions, Constraints — review and edit as needed*
*Auto-gen sections: Architecture, Context Map, Exports — run `gen-ai-context.sh --update` to refresh*
