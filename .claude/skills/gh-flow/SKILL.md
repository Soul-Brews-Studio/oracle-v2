---
name: gh-flow
description: Enforce PR-based GitHub workflow — never commit directly to main
---

# GitHub Flow Skill

Enforce PR-based workflow for all changes. Never commit directly to main.

## Trigger Phrases

- "commit", "push", "save changes"
- "merge to main", "update main"
- After completing implementation tasks
- When user says "done" or "finished" with code changes

## Workflow

### 1. Before Any Commit

Check current branch:
```bash
git branch --show-current
```

If on `main`, create a feature branch first:
```bash
# Generate branch name from context
git checkout -b feat/descriptive-name
# or fix/descriptive-name for bug fixes
```

### 2. Stage and Commit

```bash
git add -A
git commit -m "type: description

- What: specific changes
- Why: motivation"
```

### 3. Push and Create PR

```bash
# Push with upstream tracking
git push -u origin $(git branch --show-current)

# Create PR using heredoc for proper formatting
gh pr create --title "type: description" --body "$(cat <<'EOF'
## Summary
- Brief description of changes

## Changes
- List of specific changes made

## Testing
- [ ] Tests pass
- [ ] Manual testing done
EOF
)"
```

### 4. After PR Creation

- Provide the PR URL to the user
- NEVER merge the PR yourself
- Wait for user review and approval

## Branch Naming Convention

| Type | Prefix | Example |
|------|--------|---------|
| Feature | `feat/` | `feat/add-oracle-stats` |
| Bug fix | `fix/` | `fix/fts5-syntax-error` |
| Docs | `docs/` | `docs/update-readme` |
| Refactor | `refactor/` | `refactor/cleanup-search` |
| Chore | `chore/` | `chore/update-deps` |

## Critical Rules

1. **NEVER commit directly to main** - Always use feature branches
2. **NEVER merge PRs** - Only user can approve and merge
3. **NEVER force push** - Use safe git operations only
4. **Always create PR** - Even for small changes

## Recovery

If accidentally on main with uncommitted changes:
```bash
git stash
git checkout -b feat/recovery-branch
git stash pop
```

If already committed to main (not pushed):
```bash
git branch feat/recovery-branch
git reset --hard origin/main
git checkout feat/recovery-branch
```
