# Lesson Learned: Check Permissions First

**Date**: 2026-01-17
**Context**: Push to oracle-v2 failed
**Category**: Git Workflow

---

## The Problem

```
git push origin main
→ Permission denied to panya30
```

Wasted time setting up remote, staging files, committing - only to discover no push access.

## The Fix

Check permissions BEFORE attempting push:

```bash
# Check repo permissions
gh repo view OWNER/REPO --json viewerPermission

# Or just fork from the start if contributing to others' repos
gh repo fork OWNER/REPO --clone
```

## Pattern

```
Contributing to repo you don't own?
├── Option A: Check permission first
│   └── gh repo view --json viewerPermission
└── Option B: Fork from the start (safer)
    └── gh repo fork --clone
```

## Recovery When Permission Denied

```bash
# 1. Fork the repo
gh repo fork OWNER/REPO --clone=false

# 2. Add fork as remote
git remote add fork https://github.com/YOU/REPO.git

# 3. Push to fork
git push fork main

# 4. Create PR
gh pr create --repo OWNER/REPO
```

## Key Insight

> Fork workflow is the default for open source. Assume you don't have push access unless you know otherwise.

---

## Tags

`git` `permissions` `fork` `pr` `open-source` `workflow`
