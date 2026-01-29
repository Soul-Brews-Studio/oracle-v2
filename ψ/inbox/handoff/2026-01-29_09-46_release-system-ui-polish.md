# Handoff: Tag-based Release System + UI Polish

**Date**: 2026-01-29 09:46 GMT+7

## What We Did

- Implemented tag-based release system (Issue #99) - users get stable tags, main stays nightly
- Updated install.sh to support `ORACLE_NIGHTLY=1` and `ORACLE_VERSION=vX.X.X`
- Created v0.3.0 tag for first stable release
- Added auto-version display in Header (v0.3.0+hash)
- Made Graph page full-width with larger canvas
- Created Superseded page to show document evolution history
- Added trace merge functionality (backend only)
- Activity menu now defaults to searches tab
- Learned moltbot codebase via /learn command

## Pending

- [ ] Complete trace merge UI (button to select and merge traces)
- [ ] Document release process in RELEASING.md
- [ ] Test install.sh on fresh machine

## Next Session

- [ ] Add merge button to Traces detail page
- [ ] Consider trace comparison view before merge
- [ ] Test the full install flow with `curl | bash`

## Key Files

- `scripts/install.sh` - Tag-based installation logic
- `frontend/src/components/Header.tsx` - Version badge, activity link
- `frontend/src/pages/Superseded.tsx` - New page for supersession history
- `src/trace/handler.ts` - mergeTraces() function
- `src/server.ts` - POST /api/traces/:targetId/merge endpoint
- `frontend/vite.config.ts` - Auto-version from package.json + git

## Notes

- package.json stays at x.x.x-nightly, tags are manual releases
- Version format: v0.3.0+1eda59d (semver + git hash)
- Trace merge deletes source trace after combining dig points
