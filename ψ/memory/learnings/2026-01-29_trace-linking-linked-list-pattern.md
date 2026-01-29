# Trace Linking: Linked List Pattern for Non-Destructive Relationships

**Date**: 2026-01-29
**Context**: Oracle v2 trace system - connecting related traces
**Confidence**: High

## Key Learning

When you need to connect related entities without destroying data, use a linked list pattern with bidirectional references. Instead of merging traces (which deletes the source), link them with `prev_id` and `next_id` columns.

This aligns with "Nothing is Deleted" philosophy - both traces remain intact, just connected. Users can navigate the chain while preserving full history.

The pattern works for both horizontal relationships (sequential discoveries) and can coexist with vertical relationships (parent/child hierarchies). The key insight is that these are orthogonal: a trace can have a parent AND be linked to a sibling chain.

## The Pattern

```typescript
// Schema (Drizzle)
prevTraceId: text('prev_trace_id'),
nextTraceId: text('next_trace_id'),

// Link function - bidirectional
function linkTraces(db, prevId, nextId) {
  // Update prev to point forward
  db.run('UPDATE trace_log SET next_trace_id = ? WHERE trace_id = ?', [nextId, prevId]);
  // Update next to point backward
  db.run('UPDATE trace_log SET prev_trace_id = ? WHERE trace_id = ?', [prevId, nextId]);
}

// Walk the chain
function getChain(db, traceId) {
  const chain = [];
  // Walk backward to find start
  let current = getTrace(db, traceId);
  while (current?.prevTraceId) {
    current = getTrace(db, current.prevTraceId);
  }
  // Walk forward to build chain
  while (current) {
    chain.push(current);
    current = current.nextTraceId ? getTrace(db, current.nextTraceId) : null;
  }
  return chain;
}
```

## Why This Matters

1. **Data Preservation**: No information lost - both entities remain queryable
2. **Audit Trail**: Can see the evolution of discoveries over time
3. **Flexible Navigation**: Jump to any point in the chain
4. **Undo-able**: Can unlink without data loss
5. **Philosophy Alignment**: "Nothing is Deleted" in practice

## Tags

`linked-list`, `database-pattern`, `nothing-deleted`, `trace`, `navigation`
