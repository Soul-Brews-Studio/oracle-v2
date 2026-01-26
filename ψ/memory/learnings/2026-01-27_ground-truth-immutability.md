# Ground Truth Immutability: Input is Sacred

**Date**: 2026-01-27
**Context**: Arthur Oracle data pipeline architecture
**Confidence**: High

## Key Learning

Ground truth data should be treated as immutable - append-only, never modified. This is the "blockchain" pattern applied to data engineering: each record is a permanent entry that cannot be changed after the fact.

When building data pipelines, separate concerns clearly:
1. **Input layer** (ground truth): Raw data exactly as received from source APIs. Stored in JSONL, one record per event. Never modified, only appended.
2. **Transform layer** (views): Any grouping, filtering, aggregation, or presentation logic. Can change freely without affecting source.
3. **Output layer** (UI): How users see the data. Completely decoupled from storage.

This separation means you can always replay history, audit changes, and build new views without touching original data.

## The Pattern

```
Source APIs
    ↓ fetch (scheduled)
Ground Truth (ψ/data/daily/*.jsonl)
    ↓ immutable, append-only
    ↓ git commit = blockchain block

Transform/Views
    ↓ can group, filter, aggregate
    ↓ rebuild anytime from ground truth

UI (Astro, Dashboard)
    ↓ presentation only
    ↓ no data modification
```

```python
# Good: Append new records, dedupe by ID
existing_ids = load_existing_ids(daily_file)
for record in new_records:
    if record.id not in existing_ids:
        append_to_file(record)  # Never overwrite

# Bad: Modifying existing records
for record in records:
    record['grouped'] = True  # Don't modify ground truth!
    save(record)
```

## Why This Matters

1. **Auditability**: Can always trace what data existed at any point in time
2. **Reproducibility**: Views can be rebuilt from scratch if logic changes
3. **Safety**: No accidental data loss from bad transforms
4. **Simplicity**: One source of truth, many derived views
5. **Git integration**: Each commit is a verifiable snapshot (hash, timestamp, author)

This aligns with Oracle philosophy: "Nothing is Deleted" - history is preserved, not overwritten.

## Tags

`data-engineering`, `immutability`, `ground-truth`, `oracle-philosophy`, `blockchain-pattern`
