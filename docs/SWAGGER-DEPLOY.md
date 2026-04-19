# Deploying `/swagger` Publicly

The Elysia server ships a Scalar UI at `http://localhost:47778/swagger` and
the raw spec at `http://localhost:47778/swagger/json`. This doc describes
how to expose that documentation to the public internet without leaking the
oracle's private HTTP API.

> Status: **not yet deployed.** This is a choose-your-path reference.

## TL;DR

1. Run `bun scripts/export-openapi.ts` to produce `docs/openapi.json`.
2. Pick one of the three options below. **Option B (static Scalar on CF
   Workers) is the recommended path.**
3. Update the CI / release flow to re-run the export on every API change.

---

## Export the spec

`scripts/export-openapi.ts`:

- boots `bun src/server.ts` on a scratch port (default `48900`),
- polls `/` until the server is ready,
- fetches `/swagger/json`,
- validates `openapi` starts with `3.`, `info.title`, `info.version`, and
  `paths` exist,
- writes pretty-printed JSON to `docs/openapi.json`,
- kills the subprocess on success, failure, or SIGINT/SIGTERM.

```bash
bun scripts/export-openapi.ts
# → ✓ wrote /…/docs/openapi.json
#     openapi: 3.1.0
#     title:   Arra Oracle API
#     paths:   NN
```

Flags: `--port <n>` (default `48900`), `--out <path>` (default
`docs/openapi.json`).

The script does not require a build step — it runs the TypeScript server
directly via Bun.

---

## Option A — Proxy `/swagger` through studio.buildwithoracle.com

Forward `/swagger` and `/swagger/json` on the public studio host straight
to the Oracle HTTP API.

### Pros
- Always live, always matches the running server.
- No extra build/publish step; new routes show up immediately.

### Cons
- **Requires backend access on `studio.buildwithoracle.com`** — not always
  available in the current dev fleet.
- Exposes a live API surface to the internet even if only the docs are
  linked. The proxy must be locked down to `GET /swagger*` only.
- Couples studio uptime to oracle uptime.

### Sketch (Caddyfile)

```caddy
studio.buildwithoracle.com {
  @swagger path /swagger /swagger/* /swagger/json
  reverse_proxy @swagger http://oracle-world.wg:47778 {
    header_up Host oracle-world.wg
  }

  # Everything else → studio app
  reverse_proxy http://127.0.0.1:3000
}
```

### Sketch (Cloudflare Workers, fetch-style)

```ts
export default {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === 'GET' && url.pathname.startsWith('/swagger')) {
      const upstream = new URL(url.pathname + url.search, 'https://oracle.internal');
      return fetch(upstream, { headers: req.headers });
    }
    return new Response('not found', { status: 404 });
  },
};
```

Use this when the oracle host is reachable from studio's network (WireGuard
tunnel, internal Cloudflare Tunnel, etc.). Reject any method other than
`GET` at the proxy.

---

## Option B — Static export + Scalar on Cloudflare Workers (recommended)

Serve `docs/openapi.json` and a Scalar HTML shell as a static site on a
Worker. Nothing of the live server is exposed.

### Pros
- No backend access needed.
- Cheap, fast, cached at the edge.
- Docs site is a pure artifact of the repo; previewable per-PR.
- Matches the house rule: **CF Workers, not Pages** (use `wrangler deploy`
  with `assets.directory`, never `wrangler pages`).

### Cons
- Requires re-running the export on every API change.
- Docs drift if the export is skipped; guard with CI.

### Layout

```
docs/
├── openapi.json          # generated
└── site/
    ├── index.html        # Scalar UI shell
    └── _headers          # optional CF headers
```

`docs/site/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Arra Oracle API</title>
  </head>
  <body>
    <script
      id="api-reference"
      data-url="/openapi.json"
      data-proxy-url=""
    ></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>
```

Prefer pinning a Scalar version (e.g. `@scalar/api-reference@1`) in
production.

### `wrangler.json`

```json
{
  "$schema": "https://raw.githubusercontent.com/cloudflare/workers-sdk/main/packages/wrangler/config-schema.json",
  "name": "arra-oracle-docs",
  "compatibility_date": "2026-04-19",
  "main": "docs/worker.ts",
  "assets": {
    "directory": "docs/",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application"
  },
  "routes": [
    { "pattern": "docs.buildwithoracle.com", "custom_domain": true }
  ],
  "observability": { "enabled": true }
}
```

Minimal `docs/worker.ts` (optional — Workers-only assets works without a
worker, but this keeps a place to add redirects/headers later):

```ts
export interface Env { ASSETS: Fetcher }

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return env.ASSETS.fetch(new Request(new URL('/site/index.html', url), req));
    }
    return env.ASSETS.fetch(req);
  },
};
```

### Deploy (not executed)

```bash
bun scripts/export-openapi.ts
wrangler deploy
```

### Alternative UI: Redoc

Swap the Scalar shell for Redoc if you prefer its layout:

```html
<redoc spec-url="/openapi.json"></redoc>
<script src="https://cdn.jsdelivr.net/npm/redoc/bundles/redoc.standalone.js"></script>
```

Everything else (wrangler config, export script) is unchanged.

---

## Option C — GitHub Pages

Drop the same `docs/openapi.json` + Scalar HTML into a `gh-pages` branch
(or the `docs/` folder on main with Pages configured to serve from it).

### Pros
- Zero infra: repo settings + an Action.
- Free, versioned alongside source.

### Cons
- URL lives under `github.io` unless a custom domain is wired up.
- Pages is a separate publish target from the CF Workers used elsewhere in
  the fleet — adds a deploy surface.

### Sketch (`.github/workflows/docs.yml`)

```yaml
name: docs
on:
  push:
    branches: [main]
    paths:
      - 'src/routes/**'
      - 'src/server.ts'
      - 'scripts/export-openapi.ts'
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun scripts/export-openapi.ts
      - run: cp docs/site/index.html docs/index.html
      - uses: actions/upload-pages-artifact@v3
        with: { path: docs }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: "${{ steps.d.outputs.page_url }}" }
    steps:
      - id: d
        uses: actions/deploy-pages@v4
```

---

## Recommendation

Go with **Option B**. It matches the CF Workers house rule, needs no
studio backend access, and keeps the public surface to a pure static
artifact. Run `bun scripts/export-openapi.ts` in CI on any change to
`src/routes/**` or `src/server.ts` so the docs never drift.
