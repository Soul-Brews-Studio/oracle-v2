# Trace UI Fallback Patterns

**Date**: 2026-01-29
**Context**: Oracle v2 Trace UI polish session
**Confidence**: High

## Key Learning

When displaying file/resource information in UIs, always provide multiple fallback layers:

1. **Primary**: Load local content
2. **Secondary**: Search knowledge base for related content
3. **Tertiary**: Show external link (GitHub)
4. **Metadata**: Always show what's known (concepts/tags)

## The Pattern

```tsx
// 1. Try local file
const localContent = await fetchFile(path);
if (localContent) {
  setContent(localContent);
  return;
}

// 2. Search Oracle for related content
const searchResults = await searchOracle(filename);
if (searchResults?.content) {
  setContent(searchResults.content);
  setConcepts(searchResults.concepts); // Show what Oracle knows
  return;
}

// 3. Always show GitHub link as fallback
setGithubUrl(`https://github.com/${project}/${path}`);

// 4. Show "not found locally" but with context
// User sees: [View on GitHub] + [catlab] [floodboy] tags + "File not found locally"
```

## Smart Link Detection

Parse data to extract context:

```typescript
// Detect repo from commit message prefix
const match = commitMessage.match(/^([a-zA-Z0-9_-]+):\s/);
if (match) {
  targetRepo = `${org}/${match[1]}`; // "floodboy-astro: ..." → LarisLabs/floodboy-astro
}

// Detect if path is repo reference vs file path
const isRepoRef = /^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(path);
if (isRepoRef) {
  githubUrl = `https://github.com/${path}`; // Link to repo root
} else {
  githubUrl = `https://github.com/${project}/blob/main/${path}`; // Link to file
}
```

## Why This Matters

- User always gets **something useful** even when primary fails
- Shows what the system **knows** (concepts) even when content unavailable
- External links provide escape hatch to source of truth
- Graceful degradation maintains usefulness

## Tags

`ui`, `fallback`, `trace`, `github`, `concepts`, `resilience`
