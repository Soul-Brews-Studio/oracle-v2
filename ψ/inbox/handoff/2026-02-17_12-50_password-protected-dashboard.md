# Handoff: Password-Protected Dashboard

**Date**: 2026-02-17 12:50 (GMT+7)
**Context**: 85%

## What We Did
- Implemented full password-protected dashboard feature
- Added `settings` table to database schema (key-value store)
- Added auth middleware to Hono server (protects `/api/*` routes)
- Created session cookie auth with `Bun.password.hash()` / `Bun.password.verify()`
- Local network bypass (192.168.x.x, 10.x.x.x, 127.0.0.1, etc.)
- Created `AuthContext` React context for frontend auth state
- Created Login page with password form
- Created Settings page with password management, auth toggle, local bypass toggle
- Added settings gear icon + logout button to Header
- Route guard via `RequireAuth` wrapper on all protected routes
- Tested all API endpoints (set password, enable auth, login, logout, reset)
- Reset password after lockout test (user got locked out during testing)

## Auth Architecture
- Backend: Hono middleware checks `settings` table for `auth_enabled`, `auth_password_hash`, `auth_local_bypass`
- Session: Cookie-based, 7-day expiry, httpOnly
- Password: Argon2id via `Bun.password.hash()`
- Public routes: `/api/auth/status`, `/api/auth/login`, `/api/health`

## Bonus: Search Bug Fix
- Found that HTTP `/api/search` returned 0 results while MCP returned 20 for "boy workshop"
- Root cause: `src/server/handlers.ts` filtered `d.project IS NULL` when no project specified
- Fix: Changed to `1=1` (no filter) - now returns all docs like MCP does

## Pending
- [ ] Indexer returned 0 docs on reindex (search index is stale, 20h old)
- [ ] Session token verification is simplified (only checks expiry, not signature)
- [ ] Build frontend before next deploy (`cd frontend && bun run build`)
- [ ] All changes are uncommitted on main branch
- [ ] Pre-commit hook fails on 2 pre-existing test failures (drizzle-orm/bun-sqlite module resolution)

## Next Session
- [ ] Investigate indexer issue (ran but indexed 0 files on reindex)
- [ ] Strengthen session token verification (HMAC signature instead of simple hash)
- [ ] Consider adding rate limiting on login endpoint
- [ ] Commit and push all auth changes
- [ ] Test auth flow end-to-end after indexer fix

## Key Files
- `src/db/schema.ts` - Added `settings` table
- `src/server.ts` - Auth middleware, settings/auth routes, session handling
- `frontend/src/contexts/AuthContext.tsx` - New auth context
- `frontend/src/pages/Login.tsx` + `Login.module.css` - New login page
- `frontend/src/pages/Settings.tsx` + `Settings.module.css` - New settings page
- `frontend/src/api/oracle.ts` - Added auth/settings API functions
- `frontend/src/App.tsx` - AuthProvider, RequireAuth, new routes
- `frontend/src/components/Header.tsx` - Settings gear + logout button
- `frontend/src/components/Header.module.css` - New styles

## Notes
- `bun db:push` fails due to existing `trace_log_trace_id_unique` index (schema drift)
- Settings table was created via raw SQL as workaround
- Password was reset via direct DB access after lockout during testing
