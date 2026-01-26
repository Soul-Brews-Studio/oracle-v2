# Data Engineering: Ground Truth Pipeline

**Date**: 2026-01-26
**Context**: Building Arthur's data foundation for The HEADLINE
**Confidence**: High

---

## Key Learning

**Start with data quality, not features.** Before building any UI or AI features, establish a solid data engineering foundation with validation, documentation, and reproducible pipelines.

---

## The Pattern

### 1. Fetch → Normalize → Deduplicate → Store

```
7 APIs → fetch_headlines.py → MD5 dedup → headlines.jsonl
                                              ↓
                                         daily/*.jsonl (split by date)
                                              ↓
                                         YYYY-MM-DD/ (with media)
```

### 2. Schema Validation with Pydantic

```python
from pydantic import BaseModel, ConfigDict, Field

class Headline(BaseModel):
    id: str
    source_api: SourceAPI  # Enum validates values
    content_hash: str      # Custom validator checks length

    model_config = ConfigDict(extra="allow")  # Pydantic v2 style
```

**Lesson**: Use `ConfigDict` not `class Config` in Pydantic v2.

### 3. DuckDB-First for ALL Data Work

**RULE**: When dealing with data, ALWAYS use DuckDB. No Python loops for stats.

```bash
# Count
duckdb -c "SELECT COUNT(*) FROM read_json_auto('ψ/data/daily/*.jsonl')"

# Group by
duckdb -c "SELECT source_api, COUNT(*) FROM read_json_auto('ψ/data/daily/*.jsonl') GROUP BY 1 ORDER BY 2 DESC"

# Filter
duckdb -c "SELECT * FROM read_json_auto('ψ/data/daily/*.jsonl') WHERE content ILIKE '%PM2.5%'"

# Date range
duckdb -c "SELECT * FROM read_json_auto('ψ/data/daily/2026-01-*.jsonl')"

# Export to Parquet
duckdb -c "COPY (SELECT * FROM read_json_auto('*.jsonl')) TO 'data.parquet'"

# Remote files
duckdb -c "SELECT * FROM read_json_auto('https://example.com/data.jsonl')"
```

**Why DuckDB > Python loops:**
1. **Faster** — columnar engine, vectorized execution
2. **Cleaner** — one SQL line vs 20 Python lines
3. **Portable** — works on any JSONL/CSV/Parquet
4. **No dependencies** — just `duckdb` CLI

**Lesson**: If you're writing a Python loop to count/filter/aggregate, STOP. Write DuckDB SQL instead.

### 4. Numbered Output for Readability

Instead of tables:
```
1. **cm_command** (3,900 records) — Emergency Command
2. **cmu_press** (3,165 records) — University PR
...
```

Human-readable > machine-formatted.

### 5. CLI Options for Flexibility

```bash
scripts/snapshot_day.py --all           # All days
scripts/snapshot_day.py --range A B     # Date range
scripts/snapshot_day.py --list          # Show available
scripts/snapshot_day.py 2026-01-26      # Single day
```

---

## Why It Matters

- **Trust your data**: Validation catches issues early
- **Query anywhere**: DuckDB + JSONL = portable analytics
- **Reproducible**: Scripts with options > manual steps
- **Documented**: Data dictionary = shared understanding

---

## Files Created

1. `scripts/fetch_headlines.py` — Fetch + dedup
2. `scripts/snapshot_day.py` — Daily snapshots with media
3. `scripts/schema.py` — Pydantic validation
4. `ψ/data/DATA_DICTIONARY.md` — Schema documentation
5. `ψ/data/daily/*.jsonl` — 140 days of data
6. `ψ/data/headlines.jsonl` — Master file (12,157 records)

---

## Stats

- **7 APIs**, **12,157 records**, **140 days**
- **73.7% images**, **22.8% text**
- **236 unique senders**
- **33MB raw data** (gitignored)

---

## Tags

`data-engineering`, `pydantic`, `duckdb`, `validation`, `the-headline`
