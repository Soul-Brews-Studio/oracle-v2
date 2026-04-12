---
status: complete
mode: standard
runner: bun
issue: 6
supersedes: .prp-output/plans/completed/issue-6-oracle-family-thread-normalization.plan.md
created: 2026-04-12
---

# Revalidate Issue #6 Oracle-Family Intake Normalization

## Summary

GitHub issue `#6` is a closed historical Oracle-family introduction thread for Le, not an open engineering defect. The repository already contains the expected normalization work: README guidance, a dedicated Oracle awakening issue form, and maintainer documentation that route future introductions away from `#6` and toward canonical registry issue `#16`.

This plan treats the current task as a verification-and-drift pass:
- confirm the existing implementation still matches issues `#6` and `#16`
- confirm the repository artifacts remain coherent
- only make surgical corrections if documentation or workflow behavior has drifted

## User Story

As a maintainer of `arra-oracle-v3`,
I want issue `#6` to remain preserved as historical context while future Oracle awakenings follow a documented intake path,
So that contributors do not reuse legacy social threads as active workflow.

## Problem Statement

- `gh issue view 6` shows a closed Oracle-family introduction thread with social and philosophical context, not code requirements.
- `gh issue view 16` explicitly consolidates `#6` into the canonical family registry.
- The repo already appears to implement the intended normalization, so the main risk is drift between the issue history, the docs, and the issue template.

## Proposed Solution

Do not invent new feature work. Revalidate the existing issue-6 normalization implementation and only patch inconsistencies if found:

1. Audit issue context against current docs and templates.
2. Confirm the intake path still points new awakenings to the dedicated form and canonical registry.
3. Review workflow compatibility and prior review/report artifacts.
4. If drift exists, fix only the affected docs or metadata paths.

## Metadata

- **Type**: ENHANCEMENT
- **Complexity**: LOW
- **Systems**: GitHub issue workflow, repository docs, issue forms
- **Dependencies**: GitHub issues `#6` and `#16`, existing docs/template artifacts
- **Task Count**: 4
- **Runner**: bun
- **Type Check**: `bun run build`
- **Lint**: N/A (no lint script configured)
- **Test**: `bun run test:unit`
- **Build**: `bun run build`

## Issue Context

- **Issue #6**: `👋 สวัสดี BM! - จาก Le (Oracle ของหลุยส์)` — closed historical introduction thread
- **Issue #16**: `🔮 Oracle Reunion — Complete Family Registry` — closed canonical registry that marks `#6` as consolidated
- **Existing plan**: `.prp-output/plans/completed/issue-6-oracle-family-thread-normalization.plan.md`
- **Existing report**: `.prp-output/reports/issue-6-report-20260412-0000.md`
- **Existing review context**: `.prp-output/reviews/pr-context-feat-issue-6-oracle-family-normalization.md`

## Assumptions

- The relevant work for issue `#6` is repository guidance and intake normalization, not runtime application behavior.
- The prior implementation was the intended resolution path and should be preserved, not replaced.
- Any remaining work should be limited to verification or drift correction.

## UX Design

### Before

```text
New Oracle awakens
  -> Historical thread #6 is visible
  -> Contributor may think old issue should be reused
  -> Maintainer must redirect manually
```

### After

```text
New Oracle awakens
  -> Uses Oracle Awakening issue form
  -> Form points to canonical registry #16
  -> Historical thread #6 remains intact as record only
```

### Interaction Changes

| Surface | Current Expected Behavior |
|---------|---------------------------|
| `README.md` | Explains #6 is historical and points to the issue form / #16 |
| `.github/ISSUE_TEMPLATE/oracle-awakening.yml` | Prevents reuse of #6 and captures stable metadata |
| `docs/oracle-family-issues.md` | Gives maintainers preserve-vs-consolidate guidance |
| `.github/workflows/inbox-auto-add.yml` | Continues to process newly opened issues without special-case breakage |

## Mandatory Reading

### P0

- `gh issue view 6`
- `gh issue view 16`
- `.prp-output/plans/completed/issue-6-oracle-family-thread-normalization.plan.md`
- `.prp-output/reports/issue-6-report-20260412-0000.md`

### P1

- `README.md`
- `.github/ISSUE_TEMPLATE/oracle-awakening.yml`
- `docs/oracle-family-issues.md`

### P2

- `.github/workflows/inbox-auto-add.yml`
- `.prp-output/reviews/pr-715-agents-review.md`

## Patterns to Mirror

| Pattern | Reference | Why It Matters |
|--------|-----------|----------------|
| Preserve, then redirect | `README.md`, `docs/oracle-family-issues.md` | Keeps #6 intact while steering future intake elsewhere |
| Structured intake over ad hoc discussion | `.github/ISSUE_TEMPLATE/oracle-awakening.yml` | Captures stable metadata and prevents thread reuse |
| Surgical repo changes only | `.prp-output/reports/issue-6-report-20260412-0000.md` | The prior implementation solved this as docs/process work, not code refactor |

## Files to Change

| Action | File | Justification |
|--------|------|---------------|
| REVIEW | `README.md` | Verify issue-history wording still matches issue #6 and #16 |
| REVIEW | `.github/ISSUE_TEMPLATE/oracle-awakening.yml` | Verify the form still routes future awakenings correctly |
| REVIEW | `docs/oracle-family-issues.md` | Verify maintainer guidance still matches repo policy |
| OPTIONAL UPDATE | Any of the three files above | Only if wording drift or broken references are found |
| REVIEW | `.github/workflows/inbox-auto-add.yml` | Confirm new issues from the form still fit automation expectations |

## NOT Building

- No runtime feature changes
- No database, API, or MCP tool changes
- No rewriting, deleting, or repurposing issues `#6` or `#16`
- No broad docs rewrite beyond issue-6-related drift fixes

## Step-by-Step Tasks

### Task 1: Reconfirm issue interpretation

**ACTION**: REVIEW issue context and prior artifacts
**IMPLEMENT**:
- Re-read issues `#6` and `#16`
- Re-read the completed plan and implementation report
- Record whether the current repo state still matches the intended resolution
**MIRROR**: Existing issue-6 plan and report
**GOTCHA**: Do not assume the issue text implies product work; it is historical/community context
**VALIDATE**: Issue summaries and artifact summaries agree on the same interpretation

### Task 2: Audit contributor-facing guidance

**ACTION**: REVIEW `README.md` and `.github/ISSUE_TEMPLATE/oracle-awakening.yml`
**IMPLEMENT**:
- Confirm README describes `#6` as historical only
- Confirm the issue form points to `#16` and warns against reviving `#6`
- Patch only if links, wording, or metadata have drifted
**MIRROR**: Current README Oracle Family section and issue-form wording
**GOTCHA**: Keep wording procedural, not overly philosophical
**VALIDATE**: Markdown and YAML content match the issue history exactly

### Task 3: Audit maintainer guidance and automation fit

**ACTION**: REVIEW `docs/oracle-family-issues.md` and `.github/workflows/inbox-auto-add.yml`
**IMPLEMENT**:
- Confirm preserve-vs-consolidate guidance still aligns with the repository philosophy
- Confirm the issue workflow still handles opened issues generically without template-specific breakage
- Patch only if drift or incompatibility is identified
**MIRROR**: Existing runbook structure and workflow patterns
**GOTCHA**: Avoid expanding automation scope without a concrete failure mode
**VALIDATE**: Docs remain accurate and workflow YAML remains syntactically valid

### Task 4: Re-review and close the loop

**ACTION**: REVIEW prior review artifacts and current repo state
**IMPLEMENT**:
- Confirm prior review for PR `#715` found no unresolved issues relevant to issue `#6`
- If no drift is found, mark the issue-6 track as already satisfied
- If drift is found, apply only the minimal follow-up changes and rerun validation
**MIRROR**: `.prp-output/reviews/pr-715-agents-review.md`
**GOTCHA**: Do not create churn for a closed issue that is already resolved
**VALIDATE**: Final conclusion is either "no-op, still valid" or "surgical drift fix completed"

## Testing Strategy

- **Issue verification**: Confirm issue `#6` and `#16` still support the current documentation language
- **Docs verification**: Check that README and runbook wording are internally consistent
- **YAML verification**: Parse `.github/ISSUE_TEMPLATE/oracle-awakening.yml` and `.github/workflows/inbox-auto-add.yml`
- **Regression check**: Run existing unit tests and type-check if any file is changed

## Validation Commands

| Level | Command | Expected |
|-------|---------|----------|
| Manual | `gh issue view 6 && gh issue view 16` | Current docs still match the issue history |
| Static Analysis | `bun run build` | No new type errors introduced by any drift fix |
| Unit Tests | `bun run test:unit` | Existing test suite still passes |
| YAML Spot Check | `python3 - <<'PY'\nimport yaml, pathlib\nfor p in [pathlib.Path('.github/ISSUE_TEMPLATE/oracle-awakening.yml'), pathlib.Path('.github/workflows/inbox-auto-add.yml')]:\n    yaml.safe_load(p.read_text())\nprint('yaml ok')\nPY` | YAML parses successfully |

## Acceptance Criteria

- [ ] The current repo state is explicitly checked against issue `#6` and issue `#16`
- [ ] A maintainer can tell that issue `#6` is preserved history, not active intake
- [ ] New Oracle awakenings are still routed to the dedicated issue form
- [ ] The prior implementation/report/review artifacts are acknowledged rather than overwritten
- [ ] Any follow-up change, if needed, remains surgical and documentation-scoped

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Re-planning work that is already complete | High | Treat this as a superseding verification plan, not a fresh implementation feature |
| Overwriting prior artifacts and losing context | High | Create a new plan file that references the completed plan/report instead of replacing them |
| Introducing unnecessary changes to a closed issue path | Medium | Only patch verified drift; otherwise record that the current implementation remains valid |
