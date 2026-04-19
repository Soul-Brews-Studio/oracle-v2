# Plugin Menu Items

Plugins can contribute entries to the Oracle navigation menu by adding an optional
`menu` field to their `plugin.json` manifest. The scanner that backs `/api/plugins`
reads this field and the `/api/menu` aggregator (#902) merges it with menu items
from swagger tags and `src/menu/*.ts` autoloaded pages.

## Schema

```jsonc
{
  "name": "my-plugin",
  "version": "1.0.0",
  "wasm": "my-plugin.wasm",
  "menu": {
    "label": "My Plugin",        // required — shown in the menu
    "group": "tools",             // optional — "main" | "tools" | "hidden" (default "tools")
    "order": 100,                 // optional — sort key, lower first (default 999)
    "icon": "sparkles",           // optional — icon identifier
    "path": "/plugins/my-plugin"  // optional — override; default is "/plugins/<name>"
  }
}
```

All fields except `label` are optional. Invalid or unrecognized values fall back
to the defaults.

## Example

```json
{
  "name": "hello",
  "version": "1.0.0",
  "entry": "./index.ts",
  "sdk": "^0.0.1",
  "cli": {
    "command": "hello",
    "help": "arra-cli hello — sample plugin"
  },
  "menu": {
    "label": "Hello",
    "group": "tools",
    "order": 100,
    "icon": "wave"
  }
}
```

The aggregated menu item emitted for this plugin looks like:

```json
{
  "label": "Hello",
  "path": "/plugins/hello",
  "group": "tools",
  "order": 100,
  "icon": "wave",
  "source": "plugin",
  "sourceName": "hello"
}
```

## How to consume

Server code can import the helper directly:

```ts
import { getPluginMenuItems } from './routes/plugins/model.ts';

const items = getPluginMenuItems();
```

The `/api/menu` aggregator consumes this helper and merges the result with the
other menu sources.

## Groups

- `main` — top-level navigation
- `tools` — utilities / secondary menu (default)
- `hidden` — registered but not displayed; useful for deep-link routes

## Related

- `#902` — `/api/menu` aggregator (red, Phase A)
- `#903` — `src/menu/*.ts` autoload for frontend pages (orange, Phase B)
- `#904` — this change (yellow, Phase C)
- `#905` — `studio:<domain>` tag support (green, Phase D)
