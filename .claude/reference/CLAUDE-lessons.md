# CLAUDE Lessons Learned - Project-Specific Findings

## Planning & Architecture Patterns

### Patterns
- **Use parallel agents** for analyzing different aspects of complex systems
- **Ask "what's the minimum viable first step?"** before comprehensive implementation
- **1-hour implementation chunks** are optimal for maintaining focus and seeing progress
- **ccc → nnn workflow** - Context capture followed by focused planning creates better structured issues
- **Phase markers in issues** - Using "Phase 1:", "Phase 2:" helps track incremental progress

### Anti-Patterns
- **Creating monolithic plans** that try to implement everything at once
- **Trying to implement everything at once** - Start with minimum viable, test, then expand

## Common Mistakes to Avoid

### Database
- **Inline SQL for new tables** - Use Drizzle schema (`src/db/schema.ts`) + `bun db:push` instead of `db.exec(CREATE TABLE...)`
- **Modifying database outside Drizzle** - NEVER use direct SQL to ALTER TABLE, CREATE INDEX, or modify schema. Always update `src/db/schema.ts` first, then run `bun db:push`
- **Schema drift handling** - If db:push finds columns/indexes exist in DB but not in schema, add them to schema.ts to preserve data
- **Drizzle db:push index bug** - Drizzle doesn't use `IF NOT EXISTS` for indexes. If indexes already exist, db:push fails. Workaround: manually run `CREATE INDEX IF NOT EXISTS` or drop indexes first. Always backup before migrations!

### Git Workflow
- **Committing directly to main** - Always use GitHub flow: feature branch → push → PR → wait for review/merge approval
- **Skipping AI Diary and Honest Feedback in retrospectives** - These sections provide crucial context and self-reflection that technical documentation alone cannot capture

## Drizzle ORM Patterns

### Getting Inserted ID
```typescript
// WRONG (doesn't work with Drizzle + SQLite)
const result = db.insert(table).values({...}).run();
const id = result.lastInsertRowid;

// CORRECT
const [inserted] = db.insert(table).values({...}).returning().all();
const id = inserted.id;
```

### Null Handling
```typescript
// Use null coalescing for optional database fields
searches = rows.map(row => ({
  query: row.query.substring(0, 100),
  type: row.type ?? 'unknown',
  results_count: row.resultsCount ?? 0,
  search_time_ms: row.searchTimeMs ?? 0
}));
```

### Graceful Shutdown
```typescript
// WRONG - 'closeables' doesn't exist
await performGracefulShutdown({
  closeables: [...]
});

// CORRECT - use 'resources'
await performGracefulShutdown({
  resources: [
    { close: () => { closeDb(); return Promise.resolve(); } }
  ]
});
```

## User Preferences (Observed)

- **Prefers manageable scope** - Values tasks completable in under 1 hour
- **Values phased approaches** - Recognizes when plans are "too huge" and appreciates splitting work
- **Appreciates workflow patterns** - Likes using established patterns like "ccc nnn gh flow"
- **Time zone preference: GMT+7 (Bangkok/Asia)**

## Project-Specific Notes

- Portability is a core requirement - everything in the project folder should work when moved to another machine
- Use `${projectRoot}` for all dynamic paths in `.mcp.json`
- Database is tracked in git at `.oracle-v2/oracle.db`
- node_modules is included (171MB) for true portability
