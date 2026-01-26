# Handoff: Progressive Node Addition for Graph

**Date**: 2026-01-26 09:50 GMT+7
**Context**: 85%

## What We Did

- Merged 2D/3D graph views into single page with toggle button
- Implemented node trimming (200 limit, balanced by type)
- Fixed animation frame memory leak on view toggle
- Added 10-second reveal animation for demo effect
- Rebranded to "Soulbrews Oracle | Always Nightly"
- Created E2E tests with Playwright
- Cleaned up claude-mem files (17 removed)
- Added GitHub flow lesson and identity rule to CLAUDE.md

## User's New Idea

> "can we add increase node one by one (when just add node it can fast)"

**Concept**: Progressive node addition where nodes appear one by one (or in small batches) during the initial reveal. This would:
- Start with fast rendering of first few nodes
- Progressively add more nodes over time
- Create a "growing" animation effect
- Potentially improve perceived performance for large graphs

**Technical Approach** (suggested):
1. Load all data upfront
2. Start with empty or minimal node set
3. Use setInterval or requestAnimationFrame to add nodes incrementally
4. Each batch could be 5-10 nodes
5. Links appear as their connected nodes appear
6. Fast initial batch (first 20 nodes instant), then slower addition

## Pending

- [ ] Implement progressive node addition
- [ ] Consider extracting Canvas2D/Canvas3D to separate files (Graph.tsx is 768 lines)
- [ ] Issue #86: Deprecate oracle_consult (created, not implemented)

## Next Session

- [ ] Implement progressive node addition in Graph.tsx
- [ ] Test with both 2D and 3D views
- [ ] Consider using requestAnimationFrame for smooth addition
- [ ] Balance speed of initial render vs visual effect

## Key Files

- `frontend/src/pages/Graph.tsx` - Main component (768 lines)
- `frontend/src/pages/Graph.module.css` - Styles
- `frontend/e2e/graph.spec.ts` - E2E tests
