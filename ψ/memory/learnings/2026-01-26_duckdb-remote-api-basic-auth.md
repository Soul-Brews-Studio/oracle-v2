# DuckDB Can Query Remote APIs with Basic Auth

**Date**: 2026-01-26
**Context**: Discovered while building Arthur's data pipeline
**Confidence**: High (tested, working)

---

## Key Learning

**DuckDB can query authenticated HTTP APIs directly** using `CREATE SECRET` with `EXTRA_HTTP_HEADERS`. No Python fetch script needed for ad-hoc queries.

---

## The Pattern

```sql
-- 1. Load httpfs extension
INSTALL httpfs;
LOAD httpfs;

-- 2. Create secret with Basic Auth
CREATE SECRET http_auth (
    TYPE HTTP,
    EXTRA_HTTP_HEADERS MAP {
        'Authorization': 'Basic dW5pc2Vydjp1bmlzZXJ2YWRtaW4='
    }
);

-- 3. Query remote API directly!
SELECT * FROM read_json_auto('https://api.example.com/data');
```

### Base64 Encoding

```bash
# Generate Basic Auth token
echo -n "username:password" | base64
# Output: dXNlcm5hbWU6cGFzc3dvcmQ=
```

---

## Real Example: Query All 7 U-LIB APIs

```sql
INSTALL httpfs;
LOAD httpfs;

CREATE OR REPLACE SECRET http_auth (
    TYPE HTTP,
    EXTRA_HTTP_HEADERS MAP {
        'Authorization': 'Basic dW5pc2Vydjp1bmlzZXJ2YWRtaW4='
    }
);

-- All 7 APIs in one query
SELECT 'ujic' as api, status, count FROM read_json_auto('https://ujic.uniserv.cmu.ac.th/api/api.php')
UNION ALL
SELECT 'cm_command', status, count FROM read_json_auto('https://cm-command.cmuccdc.org/api/api.php')
UNION ALL
SELECT 'cmu_press', status, count FROM read_json_auto('https://pr.uniserv.cmu.ac.th/api/api.php')
-- ... etc
ORDER BY count DESC;
```

**Result:**
```
┌────────────┬─────────┬───────┐
│    api     │ status  │ count │
├────────────┼─────────┼───────┤
│ cm_command │ success │  4380 │
│ ujic       │ success │  3394 │
│ cmu_press  │ success │  3362 │
│ lp_hff     │ success │   870 │
│ haze       │ success │   811 │
│ lp_ff      │ success │   469 │
│ carbon_one │ success │   318 │
└────────────┴─────────┴───────┘
```

---

## Accessing Nested Data

APIs often wrap data in a structure like `{"status": "success", "data": [...]}`. Use `unnest()`:

```sql
SELECT unnest(data) as record
FROM read_json_auto('https://api.example.com/endpoint')
LIMIT 10;
```

---

## Why This Matters

1. **No Python needed** — Query APIs directly from DuckDB CLI
2. **Ad-hoc analysis** — Instant exploration without writing code
3. **Portable** — Same SQL works anywhere DuckDB runs
4. **Composable** — Join remote APIs with local files

---

## Gotchas

1. **Base64 encoding must be exact** — wrong encoding = 401 Unauthorized
2. **Secret persists per session** — need to recreate in new session
3. **No Bearer token shortcut for Basic Auth** — must use `EXTRA_HTTP_HEADERS`

---

## Sources

- [DuckDB HTTPS Documentation](https://duckdb.org/docs/stable/core_extensions/httpfs/https)
- [GitHub Discussion #14165 - EXTRA_HTTP_HEADERS](https://github.com/duckdb/duckdb/discussions/14165)
- [GitHub Discussion #5972 - Auth headers for httpfs](https://github.com/duckdb/duckdb/discussions/5972)

---

## Tags

`duckdb`, `httpfs`, `basic-auth`, `remote-api`, `data-engineering`
