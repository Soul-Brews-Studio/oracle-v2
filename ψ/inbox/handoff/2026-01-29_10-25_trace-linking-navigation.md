# Handoff: Trace Linking System + Navigation UI

**Date**: 2026-01-29 10:25 GMT+7

## What We Did

- Implemented trace linking (linked list pattern) with prev/next columns
- Replaced destructive `mergeTraces()` with non-destructive `linkTraces()`
- Added MCP tools: `oracle_trace_link`, `oracle_trace_unlink`, `oracle_trace_chain`
- Built numbered navigation UI: ⏮ ← [1] [2] → ⏭
- Added family chain for parent/child navigation
- Updated list view with hierarchical grouping (parent → children indented)
- Added trace ID and link status (← first last, →) to list cards
- Fixed code block scrolling (wrap instead of horizontal scroll)

## Pending

- [ ] Refactor trace handler to use Drizzle type-safe queries (currently raw SQL)
- [ ] Extract navigation component from Traces.tsx (getting complex)
- [ ] Add visual distinction between linked vs family chain
- [ ] Test install.sh on fresh machine

## Uncommitted Files

```
src/db/schema.ts - prev/next columns
src/trace/types.ts - TraceRecord interface
src/trace/handler.ts - link/unlink/chain functions
src/server.ts - HTTP endpoints
src/index.ts - MCP tools
frontend/src/pages/Traces.tsx - Navigation + list grouping
frontend/src/pages/Traces.module.css - Styles
frontend/src/pages/DocDetail.module.css - Code wrap fix
src/db/migrations/0003_rapid_strong_guy.sql - New migration
```

## Next Session

- [ ] Commit all trace linking changes
- [ ] Consider Drizzle refactor for type safety
- [ ] Test the full trace linking flow end-to-end

## Key Concepts

- **Linked chain**: Horizontal prev/next (manual linking)
- **Family chain**: Vertical parent/child (dig hierarchy)
- **Both coexist**: A trace can have parent AND be in a linked chain

## API Endpoints

- `POST /api/traces/:prevId/link` - Link two traces
- `DELETE /api/traces/:id/link?direction=prev|next` - Unlink
- `GET /api/traces/:id/linked-chain` - Get full chain
