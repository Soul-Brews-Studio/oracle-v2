---
title: **The CreatedBy Preservation Pattern**
tags: [database, drizzle, indexer, preservation, oracle-philosophy, provenance, smart-deletion, pattern]
created: 2026-01-30
source: rrr: Soul-Brews-Studio/oracle-v2
---

# **The CreatedBy Preservation Pattern**

**The CreatedBy Preservation Pattern**

When building systems that both auto-generate and user-create data in the same table, add a `createdBy` field to distinguish origins. This enables smart deletion - automated processes can clean up their own data without destroying user-created content.

The pattern:
1. Add `createdBy TEXT` column to the table
2. Auto-generated rows set `createdBy: 'indexer'` (or similar)
3. User-created rows set `createdBy: 'oracle_learn'` (or similar)
4. Cleanup operations filter: `WHERE createdBy = 'indexer' OR createdBy IS NULL`

The `OR createdBy IS NULL` handles legacy data that predates the field.

This pattern embodies the Oracle philosophy of "Nothing is Deleted" while enabling practical cleanup. The indexer needs to clear old data before re-indexing, but `oracle_learn` documents have no local files - deleting them destroys cross-repo knowledge permanently.

The `createdBy` field creates a contract: "I only clean up my own mess." This enables cross-repo knowledge sharing, manual curation preservation, safe automated cleanup, and clear provenance.

---
*Added via Oracle Learn*
