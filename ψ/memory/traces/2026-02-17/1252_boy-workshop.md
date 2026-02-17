---
query: "boy workshop"
target: "Soul-Brews-Studio/oracle-v2"
mode: smart
timestamp: 2026-02-17 12:52
---

# Trace: boy workshop

**Target**: Soul-Brews-Studio/oracle-v2
**Mode**: smart (Oracle first)
**Time**: 2026-02-17 12:52 GMT+7

## Oracle Results
20 matches via MCP oracle_search. Top hits:

1. **retro** `ψ/memory/retrospectives/2026-01/20/09.07_morning-wakeup-anthropic-oracle-comparison.md` - Morning orientation mentioning "Workshop Boy today"
2. **retro** `ψ/memory/retrospectives/2026-01/20/11.06_morning-to-workshop-ndf-dev.md` - Session at NDF Dev (Saraphi) for Workshop Boy (Pinyo), QR code generation
3. **learning** `ψ/memory/learnings/2026-01-07_session-snapshot-trace-dig-schedule.md` - Action item: "Confirm Workshop Boy exact dates with Pinyo"
4. **learning** `ψ/memory/learnings/2026-01-07_calendar-visualization-pattern-for-schedule-awa.md` - Calendar annotation showing Workshop dates
5. **learning** `ψ/memory/learnings/2025-12-nazt-github-profile.md` - GitHub org: 3E-Workshop

## Bug Found During Trace
HTTP API `/api/search` returned **0 results** while MCP returned **20 results** for the same query.

**Root cause**: `src/server/handlers.ts` line 58-60 - when no project param is passed, the query filtered `d.project IS NULL` (universal docs only). Most docs have a project set, so they were excluded.

**Fix**: Changed `'d.project IS NULL'` to `'1=1'` (no filter when no project specified). HTTP API now returns 22 results.

## Summary
- "Workshop Boy" refers to workshops with Pinyo, hosted at NDF Dev (Saraphi)
- Related to January 2026 schedule events
- Found critical search bug that was hiding results from frontend users
