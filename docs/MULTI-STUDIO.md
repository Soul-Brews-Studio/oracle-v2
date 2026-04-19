# Multi-studio menu items (`studio:<domain>` tag)

> hook_menu Phase 4 — issue [#905](https://github.com/Soul-Brews-Studio/arra-oracle-v3/issues/905)
> Parent tracker: [#901](https://github.com/Soul-Brews-Studio/arra-oracle-v3/issues/901)

## Why

A single Arra backend (`localhost:47778`) can be the data source for many
specialized studios — `studio.buildwithoracle.com`, `plugins.studio`,
`canvas.studio`, etc. We want the menu to surface those external studios
without requiring each one to know about every other.

The rule:

> **One backend, many faces. The menu carries the destination; the data
> always flows through the local Oracle.**

## How it works

Any API route can declare itself as belonging to an external studio by
adding a `studio:<domain>` tag to its swagger `detail.tags`:

```ts
// src/routes/plugins/list.ts
new Elysia().get('/plugins', handler, {
  detail: {
    tags: ['plugins', 'nav:main', 'studio:plugins.example.com'],
    summary: 'List installed plugins',
  },
});
```

The `/api/menu` aggregator (Phase A, [#902](https://github.com/Soul-Brews-Studio/arra-oracle-v3/issues/902))
parses the tag and emits:

```json
{
  "path": "/plugins",
  "label": "Plugins",
  "group": "main",
  "source": "api",
  "studio": "plugins.example.com"
}
```

## Studio render rule

When studio renders a `MenuItem` whose `studio` field is set, the link
points at the external host but appends `?host=<currentHost>` so all data
calls still hit the user's local backend:

```ts
import { studioHref } from '@/routes/menu/studio-href';

studioHref(
  { path: '/plugins', studio: 'plugins.example.com' },
  'http://localhost:47778',
);
// → "https://plugins.example.com/plugins?host=http%3A%2F%2Flocalhost%3A47778"
```

The receiving studio reads `?host=` on boot, sets its API base accordingly,
and proxies all requests back to the originating Oracle. Auth, data, and
state stay local; only the UI changes hosts.

If `studio` is unset, `studioHref` returns the raw `path` — the link stays
within the current studio.

## Pieces in this PR

| File | Purpose |
|---|---|
| `src/routes/menu/model.ts` | `MenuItem` TypeBox schema + TS interface (with nullable `studio`) |
| `src/routes/menu/studio-tag.ts` | `parseStudioTag(tags)` — extracts `<domain>` from `['studio:foo.com', ...]` |
| `src/routes/menu/studio-href.ts` | `studioHref(item, currentHost)` — builds the cross-studio URL |
| `tests/http/menu/studio-tag.test.ts` | Unit tests for both helpers |

## Integration with red's aggregator

When [#902](https://github.com/Soul-Brews-Studio/arra-oracle-v3/issues/902)
lands its `/api/menu` aggregator (`src/routes/menu/menu.ts`), the swagger-tag
loop should call `parseStudioTag(operation.tags)` and assign the result to
`MenuItem.studio`. The schema already accepts it; no further changes needed
on the aggregator side beyond that one-line wire-up.

## Non-goals

- Federation handshakes between studios (each studio is a static SPA).
- Auth delegation across domains (the receiving studio talks to the
  user's local Oracle, not a federated identity service).
- Per-user studio preferences (studios are public choices, not user state).
