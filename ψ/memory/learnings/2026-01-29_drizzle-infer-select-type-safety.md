# Drizzle $inferSelect for Type-Safe Database Row Parsing

**Date**: 2026-01-29
**Context**: Oracle v2 trace handler refactoring
**Confidence**: High

## Key Learning

When parsing database rows in Drizzle ORM, use `typeof table.$inferSelect` to get full TypeScript inference from the schema. This makes the schema the single source of truth - any column additions or type changes will be caught at compile time.

Instead of manually typing row objects or using `any`, let Drizzle's type inference do the work. This eliminates the common bug pattern where schema changes don't get propagated to parsing functions.

## The Pattern

```typescript
import { db, traceLog } from '../db/index.js';

// Type the row using schema inference
function parseTraceRow(row: typeof traceLog.$inferSelect): TraceRecord {
  return {
    id: row.id,                    // TypeScript knows this is number
    traceId: row.traceId,          // TypeScript knows this is string
    query: row.query,              // TypeScript knows this is string
    depth: row.depth || 0,         // TypeScript knows this is number | null
    // ... all fields type-checked against schema
  };
}

// Query returns typed rows
const row = db
  .select()
  .from(traceLog)
  .where(eq(traceLog.traceId, id))
  .get();  // row is typeof traceLog.$inferSelect | undefined

if (row) {
  return parseTraceRow(row);  // Type-safe!
}
```

## Why This Matters

1. **Schema as Truth**: Add a column to schema.ts → TypeScript immediately catches missing fields
2. **Compile-Time Safety**: No more runtime "undefined is not a function" from mismatched types
3. **IDE Support**: Full autocomplete for row fields
4. **Refactoring Confidence**: Rename a column → all usages highlighted as errors
5. **Documentation**: Types serve as self-documenting code

## Comparison

**Before (raw SQL, type-unsafe)**:
```typescript
function getTrace(db: Database, traceId: string) {
  const row = db.query('SELECT * FROM trace_log WHERE trace_id = ?').get(traceId);
  // row is 'any' - no type checking
  return {
    id: row.id,           // Could be wrong column name
    traceId: row.trace_id // Could be wrong type
  };
}
```

**After (Drizzle, type-safe)**:
```typescript
function getTrace(traceId: string) {
  const row = db.select().from(traceLog).where(eq(traceLog.traceId, traceId)).get();
  // row is fully typed from schema
  if (!row) return null;
  return parseTraceRow(row);  // Compile-time type checking
}
```

## Tags

`drizzle`, `typescript`, `type-safety`, `database`, `orm`, `refactoring`
