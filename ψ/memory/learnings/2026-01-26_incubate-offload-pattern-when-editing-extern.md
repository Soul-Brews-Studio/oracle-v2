---
title: ## Incubate --offload Pattern
tags: [incubate, offload, ghq, symlink, project, workflow, anti-pattern]
created: 2026-01-26
source: Oracle Learn
---

# ## Incubate --offload Pattern

## Incubate --offload Pattern

When editing external repos, use `/project incubate --offload` instead of raw `git clone`:

**Flow**:
1. `ghq get -u URL` → clones to ghq root (~/Code/)
2. Symlink to `ψ/incubate/owner/repo`
3. Make changes, commit, push
4. Offload: remove symlink (optionally purge ghq clone)

**Why**:
- Keeps ψ/ clean (no leftover clones)
- Single source of truth (ghq owns clones)
- Traceable workflow (symlinks show intent)
- Anti-pattern: `git clone` to /tmp/ or random locations

**Commands**:
```bash
# Offload (keep ghq)
rm ψ/incubate/owner/repo

# Offload + purge (remove everything)
rm ψ/incubate/owner/repo && rm -rf "$(ghq root)/github.com/owner/repo"
```

---
*Added via Oracle Learn*
