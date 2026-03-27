---
description: Fresh start context summary
---

# /recap - Fresh Start Summary

Quick catch-up for new sessions.

## Usage

```
/recap    # Get caught up
```

## Action

Run these commands and summarize:

```bash
git log --since="24 hours ago" --format="%h %ar %s" -10
git status --short
gh issue list --limit 5 --json number,title
```

Output format:

```markdown
## 🕐 [Current Time]

### Recent Changes
| When | What |
|------|------|

### Working State
[Clean or list modified files]

### Active Issues
| # | Title |
|---|-------|

**Now**: [What to focus on]
```
