# Handoff: Auth Feature + Search Bug Fix + ψ Gitignore Issue

**Date**: 2026-02-17 13:05 (GMT+7)
**Context**: 90%

## What We Did

### 1. Password-Protected Dashboard (Complete)
- Added `settings` table to `src/db/schema.ts` (key-value store)
- Added auth middleware to `src/server.ts` protecting `/api/*` routes
- Session cookie auth with `Bun.password.hash()` (Argon2id)
- Local network bypass (192.168.x.x, 10.x.x.x, 127.0.0.1)
- Created `AuthContext`, Login page, Settings page
- Added gear icon + logout button to Header
- Route guard via `RequireAuth` wrapper on all routes
- Tested full flow: set password, enable auth, login, logout, lockout recovery

### 2. Search Bug Fix (Critical)
- HTTP `/api/search` returned **0 results** while MCP returned 20+ for same query
- Root cause: `src/server/handlers.ts` filtered `d.project IS NULL` when no project specified
- Fix: Changed to `1=1` (no filter) — now matches MCP behavior
- This was hiding results from ALL frontend users

### 3. /trace "boy workshop" (deep, 5 agents)
- Found Workshop Boy details across 6+ repos
- Logged to Oracle trace system

### 4. /watch ClawdBot Tutorial
- Transcribed YouTube video about OpenClaw/ClawdBot
- Saved learning to ψ/memory/learnings/

## CRITICAL: ψ/ Directory Should NOT Be in Git

**Problem discovered**: The `ψ/` directory contains personal Oracle knowledge (learnings, retrospectives, traces). When someone else clones oracle-v2:
- They get Nat's personal data
- The indexer indexes it as their Oracle's knowledge
- Personal workshop pricing, schedule, family info exposed

**Current state**: `.gitignore` does NOT ignore `ψ/` — some files are already committed to git from previous sessions.

**Recommended fix**:
```
# Add to .gitignore
ψ/memory/learnings/
ψ/memory/retrospectives/
ψ/memory/traces/
ψ/inbox/
ψ/data/

# KEEP in git (template structure):
ψ/memory/resonance/   # Philosophy docs (part of Oracle identity)
```

Then: `git rm -r --cached ψ/memory/learnings/ ψ/memory/retrospectives/ ψ/memory/traces/ ψ/inbox/`

**Alternative**: Ship ψ/ as empty template dirs with `.gitkeep` files only.

## Pending (Uncommitted)
- [ ] **All auth feature files** — staged but not committed (pre-commit hook fails on pre-existing test issues)
- [ ] **Search bug fix** in `src/server/handlers.ts`
- [ ] **ψ/ gitignore** — needs decision on what to keep vs ignore
- [ ] Trace logs and learning files (untracked)
- [ ] Pre-commit hook: 2 pre-existing test failures (`drizzle-orm/bun-sqlite` module resolution) block commit

## Next Session
- [ ] Decide ψ/ gitignore strategy and implement
- [ ] Commit auth feature with `--no-verify` (pre-existing test failures)
- [ ] Fix the 2 pre-existing test failures (drizzle-orm/bun-sqlite import)
- [ ] Investigate indexer returning 0 docs on reindex
- [ ] Consider: should oracle-v2 ship with example ψ/ content or empty?

## Key Files Modified
| File | Change |
|------|--------|
| `src/db/schema.ts` | Added `settings` table |
| `src/server.ts` | Auth middleware, settings/auth routes, session handling |
| `src/server/handlers.ts` | Search bug fix: `1=1` instead of `d.project IS NULL` |
| `frontend/src/contexts/AuthContext.tsx` | New — auth context |
| `frontend/src/pages/Login.tsx` + CSS | New — login page |
| `frontend/src/pages/Settings.tsx` + CSS | New — settings page |
| `frontend/src/api/oracle.ts` | Added auth/settings API functions |
| `frontend/src/App.tsx` | AuthProvider, RequireAuth, new routes |
| `frontend/src/components/Header.tsx` + CSS | Settings gear + logout button |
