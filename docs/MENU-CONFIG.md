# Menu Configuration

The `/api/menu` endpoint aggregates navigation items from three sources:

1. **API nav tags** — routes tagged `nav:main` / `nav:tools` / `nav:hidden`
2. **Frontend page declarations** — `src/menu/frontend.ts`
3. **Runtime configuration** — gist URL + env + DB settings

Runtime configuration lets you add pages and hide existing ones without a redeploy.

## Sources, in order of application

| Source | Adds items | Disables items | Scope |
|---|---|---|---|
| `ORACLE_MENU_GIST` env — gist JSON URL | ✓ (`items[]`) | ✓ (`disable[]`) | Host/env |
| `ORACLE_NAV_DISABLE` env — comma-separated paths | — | ✓ | Host/env |
| `settings` table key `nav_disabled` — JSON array | — | ✓ | DB (persistent) |

All disable lists union. Gist `items` are additive, deduped by `group:path` against existing API- and frontend-derived entries.

## Gist format

Point `ORACLE_MENU_GIST` at either:

- A raw gist URL: `https://gist.githubusercontent.com/<user>/<id>/raw/`
- A gist page URL: `https://gist.github.com/<user>/<id>` — auto-transformed
- A hash-pinned page URL: `https://gist.github.com/<user>/<id>/<revision-sha>` — freezes the revision

The content must be JSON matching:

```json
{
  "items": [
    { "path": "/lab", "label": "Lab", "group": "tools", "order": 90, "source": "page" }
  ],
  "disable": ["/superseded"]
}
```

Both keys are optional. `items[]` entries follow the `MenuItem` schema from
`src/routes/menu/model.ts` (`path`, `label`, `group`, `order`, optional `icon`,
`studio`, `access`, `source`).

### Caching

- **Unpinned URL** — 5-minute in-memory cache. Change the gist, wait ≤5 min or hit `/api/menu/reload`.
- **Hash-pinned URL** — immutable, cached indefinitely. Swap the hash in the env to cut over to a new revision.

### Error handling

- Fetch retries with exponential backoff: 200 ms, 500 ms, 1 s (3 retries total).
- After all retries fail, the menu falls back to the **last-known-good** gist response and marks the source `status: "stale"`. The server never crashes if the gist is unreachable.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/menu` | Aggregated menu items |
| GET | `/api/menu/source` | Current gist state — see shape below |
| POST | `/api/menu/reload` | Clear cache, refetch, return fresh `/menu/source` |

`/api/menu/source` response:

```json
{
  "url": "https://gist.github.com/natw/abc123",
  "hash": "a1b2c3d4e5f6...",
  "loaded_at": 1745055555123,
  "status": "ok"
}
```

`status` is one of:
- `"ok"` — fresh load succeeded
- `"stale"` — network failed, serving last-known-good
- `"error"` — network failed and no cached value available
- `"none"` — no gist URL configured

## Env variables

```bash
# Pin to a specific revision (reproducible) — preferred for production
export ORACLE_MENU_GIST="https://gist.github.com/natw/abc123/a1b2c3d4e5f6..."

# Or point at the live gist (auto-refreshes every 5 min)
export ORACLE_MENU_GIST="https://gist.github.com/natw/abc123"

# Hide paths host-wide (comma-separated)
export ORACLE_NAV_DISABLE="/superseded,/legacy"
```

## DB settings

```ts
import { setSetting } from './src/db/index.ts';
setSetting('nav_disabled', JSON.stringify(['/superseded', '/legacy']));
```

Delete the row (or set to `null`) to clear.
