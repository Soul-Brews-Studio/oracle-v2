---
description: Search git history, retrospectives, issues, codebase
---

# /trace - Find Anything

Search across git history, issues, files, and retrospectives.

## Usage

```
/trace [query]     # Search for something
/trace incubation  # Show all projects
```

ARGUMENTS: $ARGUMENTS

## Action

Search for "$ARGUMENTS" across:

```bash
git log --all --oneline --grep="$ARGUMENTS" | head -15
gh issue list --state all --search "$ARGUMENTS" --json number,title
find . -iname "*$ARGUMENTS*" -type f | head -20
grep -ril "$ARGUMENTS" --include="*.md" | head -20
```

Return: Locations found with context.

## Output Format

```markdown
## 🔍 /trace: $ARGUMENTS

### 📍 Found

| Source | Location | Context |
|--------|----------|---------|
| git | commit abc123 | ... |
| file | path/to/file.md | ... |
| issue | #42 | ... |
```
