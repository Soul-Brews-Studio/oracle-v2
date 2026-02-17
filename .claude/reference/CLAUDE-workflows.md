# CLAUDE Workflows - Development Patterns & Short Codes

## Context & Planning Workflow (Core Pattern)

### Short Codes
- `ccc` - Create context issue and compact the conversation
- `nnn` - Smart planning: Auto-runs `ccc` if no recent context → Create detailed implementation plan
- `gogogo` - Execute the most recent plan issue step-by-step
- `rrr` - Create detailed session retrospective

## Two-Issue Pattern

The `ccc` → `nnn` workflow uses a two-issue pattern:
1. **Context Issues** (`ccc`): Preserve session state and context
2. **Task Issues** (`nnn`): Contain actual implementation plans

This separation ensures clear distinction between context dumps and actionable tasks.

## Core Short Codes

### `ccc` - Create Context & Compact

**Purpose**: Save current session state to forward to another task.

1. **Gather Information**:
   ```bash
   git status --porcelain
   git log --oneline -5
   ```

2. **Create GitHub Context Issue**: Use detailed template with:
   - Current state
   - Changed files
   - Key discoveries
   - Next steps

3. **Compact Conversation**: `/compact`

### `nnn` - Next Task Planning

**Purpose**: Create comprehensive implementation plan. **NO CODING** - only research and planning.

1. **Check for Recent Context**: If none exists, run `ccc` first
2. **Gather All Context**: Analyze context issue or specified issue (`nnn #123`)
3. **Deep Analysis**: Read context, analyze codebase, research patterns
4. **Create Comprehensive Plan Issue** with:
   - Problem statement
   - Research findings
   - Proposed solution
   - Implementation steps
   - Risks
   - Success criteria
5. **Provide Summary**: Briefly summarize and share issue number

### `gogogo` - Execute Planned Implementation

1. **Find Implementation Issue**: Locate most recent `plan:` issue
2. **Execute Implementation**: Follow plan step-by-step
3. **Test & Verify**: Run tests, verify implementation
4. **Commit & Push**: Commit, push to feature branch, create/update PR

### `rrr` - Retrospective

**Purpose**: Document session activities, learnings, outcomes.

**CRITICAL**: AI Diary and Honest Feedback sections are MANDATORY.

1. **Gather Session Data**:
   ```bash
   git diff --name-only main...HEAD
   git log --oneline main...HEAD
   ```

2. **Create Retrospective Document**: In `ψ/memory/retrospectives/YYYY-MM/DD/HH.MM_slug.md`
   - **AI Diary**: First-person narrative of session experience
   - **Honest Feedback**: Frank assessment of what worked/didn't

3. **Validate Completeness**: Ensure no sections are skipped

4. **Update CLAUDE.md**: Copy new lessons learned (append to bottom only)

5. **Link to GitHub**: Commit retrospective, comment on issue/PR

**Time Zone Note**:
- **PRIMARY: GMT+7 (Bangkok)** - Always show GMT+7 first
- UTC can be in parentheses for reference

## GitHub Workflow

### Creating Issues
```bash
# 1. Update main branch
git checkout main && git pull

# 2. Create detailed issue
gh issue create --title "feat: Descriptive title" --body "$(cat <<'EOF'
## Overview
Brief description of the feature/bug.

## Current State
What exists now.

## Proposed Solution
What should be implemented.

## Technical Details
- Components affected
- Implementation approach

## Acceptance Criteria
- [ ] Specific testable criteria
- [ ] Performance requirements
- [ ] UI/UX requirements
EOF
)"
```

### Standard Development Flow
```bash
# 1. Create branch from issue
git checkout -b feat/issue-number-description

# 2. Make changes
# ... implement feature ...

# 3. Test thoroughly
# Use 'ttt' short code for full test suite

# 4. Commit with descriptive message
git add -A
git commit -m "feat: Brief description

- What: Specific changes made
- Why: Motivation for the changes
- Impact: What this affects

Closes #issue-number"

# 5. Push and create Pull Request
git push -u origin branch-name
gh pr create --title "Same as commit" --body "Fixes #issue_number"

# 6. CRITICAL: NEVER MERGE PRs YOURSELF
# DO NOT use: gh pr merge
# ONLY provide PR link to user
# WAIT for explicit user instruction
```

## Testing Discipline

### Manual Testing Checklist
Before pushing:
- [ ] Run build successfully
- [ ] Verify no new build warnings or type errors
- [ ] Test all affected pages and features
- [ ] Check browser console for errors
- [ ] Test mobile responsiveness if applicable
- [ ] Verify all interactive features work
