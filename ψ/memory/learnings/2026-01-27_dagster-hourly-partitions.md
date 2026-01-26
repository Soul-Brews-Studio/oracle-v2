# Dagster Hourly Partitions with Timezone

**Date**: 2026-01-27
**Context**: Setting up backfill-capable hourly data pipeline
**Confidence**: High

## Key Learning

Dagster's `HourlyPartitionsDefinition` defaults to **UTC timezone**. If you're in a different timezone (like GMT+7), partitions won't match your local time and the UI will show "0 partitions".

**The fix**: Always specify `timezone` parameter.

```python
from dagster import HourlyPartitionsDefinition

# Wrong - defaults to UTC
hourly_partitions = HourlyPartitionsDefinition(start_date="2026-01-27-00:00")

# Correct - specify timezone
hourly_partitions = HourlyPartitionsDefinition(
    start_date="2026-01-27-00:00",
    timezone="Asia/Bangkok",  # GMT+7
)
```

## Parallel API Fetching

Use `ThreadPoolExecutor` for parallel API calls within a single Dagster asset:

```python
from concurrent.futures import ThreadPoolExecutor, as_completed

@asset(partitions_def=hourly_partitions)
def api_fetch_results(context):
    with ThreadPoolExecutor(max_workers=7) as executor:
        futures = {
            executor.submit(fetch_api, name, url): name
            for name, url in APIS.items()
        }
        for future in as_completed(futures):
            result = future.result()
            # process result
```

**Result**: 7 APIs in ~1.5s parallel vs ~9s sequential.

## Backfill UI

With partitions configured:
1. Go to **Jobs** → select job → **Partitions** tab
2. See partition timeline (green = materialized, striped = missing)
3. Click **Materialize** → select range → **Launch backfill**
4. Monitor in **Overview** → **Backfills** tab

## Gotchas

1. **Timezone mismatch**: Partitions in UTC, local time in GMT+7 = 0 visible partitions
2. **Code reload**: Restart `dagster dev` after changing partition definitions
3. **Network access**: Use `-h 0.0.0.0` to expose Dagster beyond localhost

```bash
# Expose to network
DAGSTER_HOME=.dagster_home uv run dagster dev -m dagster_pipeline -p 3005 -h 0.0.0.0
```

## Why This Matters

Hourly partitions enable:
- **Backfills**: Re-run specific hours if data was missed
- **Observability**: See which hours succeeded/failed
- **Incremental processing**: Only process new partitions

Combined with "ground truth immutability" - each partition is a permanent record.

## Tags

`dagster`, `partitions`, `timezone`, `backfill`, `parallel-fetch`
