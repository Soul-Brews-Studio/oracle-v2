---
title: ## UI Pattern: Show Both Local and Remote File Status
tags: [ui, files, github, local-vs-remote, trace]
created: 2026-01-29
source: Trace UI bug fix session 2026-01-29
---

# ## UI Pattern: Show Both Local and Remote File Status

## UI Pattern: Show Both Local and Remote File Status

When displaying files in trace/search results, show BOTH:
1. **Local status** - whether file exists locally (ghq clone)
2. **Remote link** - GitHub URL as fallback

This is better than just "File not found" because:
- User knows the file EXISTS (just not locally)
- One-click to view on GitHub
- Can decide whether to clone repo locally

Implementation in Traces.tsx:
```tsx
{fileNotFoundLocally ? (
  <div>
    <span>File not found locally</span>
    <a href={githubUrl}>View on GitHub →</a>
  </div>
) : (
  <pre>{fileContent}</pre>
)}
```

Smart link detection:
- If path looks like `Org/repo` → link to repo root
- If path has nested structure → link to file within project

---
*Added via Oracle Learn*
