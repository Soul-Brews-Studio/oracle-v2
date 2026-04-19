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

All disable lists union. Items from the gist are additive, deduped by `group:path`.

## Gist format

Point `ORACLE_MENU_GIST` at either:

- A raw gist URL: `https://gist.githubusercontent.com/<user>/<id>/raw/`
- A gist page URL: `https://gist.github.com/<user>/<id>` — auto-transformed to raw

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

The fetched gist is cached in-memory for 5 minutes. Unreachable gists fall back
silently — the menu still returns the remaining sources.

## Env variables

```bash
# Point at a gist — page URL or raw URL both work
export ORACLE_MENU_GIST="https://gist.github.com/natweerawan/abc123"

# Hide paths host-wide (comma-separated)
export ORACLE_NAV_DISABLE="/superseded,/legacy"
```

## DB settings

```ts
import { setSetting } from './src/db/index.ts';
setSetting('nav_disabled', JSON.stringify(['/superseded', '/legacy']));
```

Delete the row (or set to `null`) to clear.
