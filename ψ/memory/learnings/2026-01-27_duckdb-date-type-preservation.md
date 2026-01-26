# DuckDB Preserves Python Types Through JSON Parsing

**Date**: 2026-01-27
**Context**: Dagster pipeline backfill filtering
**Confidence**: High

## Key Learning

When DuckDB reads JSON data using `read_json_auto()`, it intelligently detects and preserves data types. A field like `"only_date": "2025-09-09"` in JSON will be parsed as a Python `datetime.date` object, not a string.

This means comparisons like:
```python
record.get("only_date") == "2025-09-09"  # FAILS!
# datetime.date(2025, 9, 9) != "2025-09-09"
```

Will always return `False` because you're comparing `datetime.date` with `str`.

## The Fix

Always convert dates to strings explicitly before comparison:

```python
only_date = record.get("only_date")
if only_date:
    # Convert date object to string
    record_date = str(only_date) if hasattr(only_date, 'isoformat') else only_date
else:
    record_date = str(record.get("created_at", ""))[:10]

if record_date == partition_date:  # Now both are strings
    # Process record
```

## Why This Matters

1. **Silent failures**: The comparison doesn't error - it just returns False
2. **Hard to debug**: Both values "look" the same when printed
3. **DuckDB feature**: Type inference is usually helpful, but can surprise you

## General Rule

When filtering data from DuckDB by date:
- Check the actual type with `type(value)`
- Always convert to string for string comparisons
- Or convert both to `datetime.date` for date comparisons

## Tags

`duckdb`, `datetime`, `type-coercion`, `filtering`, `debugging`
