# GHQ Path = GitHub URL: Elegant Cross-Repo File Resolution

**Date**: 2026-01-26
**Context**: Oracle graph showing nodes from multiple repos
**Confidence**: High

## Key Learning

The ghq path structure (`github.com/owner/repo`) is identical to GitHub URLs, enabling elegant cross-repo file resolution with a single `project` field.

When Oracle indexes documents from multiple repos, each document has:
- `source_file`: relative path from repo root (e.g., `ψ/memory/resonance/personality-v2.md`)
- `project`: ghq-style path (e.g., `github.com/laris-co/Nat-s-Agents`)

## The Pattern

### Local File Access
```javascript
const GHQ_ROOT = process.env.GHQ_ROOT || await detectGhqRoot();
const fullPath = path.join(GHQ_ROOT, project, source_file);
// /Users/nat/Code/github.com/laris-co/Nat-s-Agents/ψ/memory/resonance/personality-v2.md
```

### GitHub URL
```javascript
const githubUrl = `https://${project}/blob/main/${source_file}`;
// https://github.com/laris-co/Nat-s-Agents/blob/main/ψ/memory/resonance/personality-v2.md
```

### API Design
```typescript
// Frontend
getFile(source_file: string, project?: string)

// Backend /api/file
if (project) {
  basePath = path.join(GHQ_ROOT, project);
} else {
  basePath = REPO_ROOT;
}
```

## Why This Matters

1. **No hardcoding**: ghq manages repos, Oracle just stores paths
2. **Works locally AND online**: Same `project` field for both
3. **Symlink-friendly**: ghq structure follows symlinks correctly
4. **Multi-repo knowledge graph**: Nodes from any indexed repo can be viewed

## The Truth

If a node exists in the graph (a dot), its file MUST be resolvable. The `project` field is the missing piece that makes cross-repo references work.

> "Every dot must have a reference to truth"

## Tags

`ghq`, `cross-repo`, `file-resolution`, `architecture`, `oracle-philosophy`
