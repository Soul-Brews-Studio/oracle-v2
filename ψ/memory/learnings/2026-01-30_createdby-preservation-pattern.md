---
title: CreatedBy Preservation Pattern
date: 2026-01-30
source: rrr: Soul-Brews-Studio/oracle-v2
tags: [database, drizzle, indexer, preservation, oracle-philosophy]
confidence: High
---

# The CreatedBy Preservation Pattern

## Key Learning

When building systems that both auto-generate and user-create data in the same table, add a `createdBy` field to distinguish origins. This enables smart deletion - automated processes can clean up their own data without destroying user-created content.

The pattern is simple but powerful:
1. Add `createdBy TEXT` column to the table
2. Auto-generated rows set `createdBy: 'indexer'` (or similar)
3. User-created rows set `createdBy: 'oracle_learn'` (or similar)
4. Cleanup operations filter: `WHERE createdBy = 'indexer' OR createdBy IS NULL`

The `OR createdBy IS NULL` handles legacy data that predates the field.

## The Pattern

```typescript
// Smart deletion - only delete what you created
const docsToDelete = db.select({ id: table.id })
  .from(table)
  .where(
    and(
      // Scope to current context
      or(eq(table.project, currentProject), isNull(table.project)),
      // Only delete auto-generated OR legacy docs
      or(eq(table.createdBy, 'indexer'), isNull(table.createdBy))
    )
  )
  .all();

// Insert with provenance
db.insert(table)
  .values({
    ...data,
    createdBy: 'indexer',  // Mark origin
  })
  .onConflictDoUpdate({
    target: table.id,
    set: {
      ...data,
      // Don't update createdBy - preserve original!
    }
  })
  .run();
```

## Why This Matters

This pattern embodies the Oracle philosophy of "Nothing is Deleted" while still enabling practical cleanup. The indexer needs to clear old data before re-indexing, but `oracle_learn` documents have no local files - deleting them destroys cross-repo knowledge permanently.

The `createdBy` field creates a contract: "I only clean up my own mess." This enables:
- Cross-repo knowledge sharing (oracle_learn docs survive re-indexing)
- Manual curation (human-added docs are preserved)
- Safe automated cleanup (indexer can run without fear)
- Clear provenance (always know where data came from)

## Applications

- Any table with both automated and manual data entry
- Sync systems that shouldn't delete locally-modified records
- Cache tables that preserve pinned/starred items
- Log tables where some entries are user-annotated

## Tags

`database`, `drizzle`, `indexer`, `preservation`, `oracle-philosophy`, `provenance`, `smart-deletion`
