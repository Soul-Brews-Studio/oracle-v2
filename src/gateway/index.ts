/**
 * Gateway Elysia plugin — wires config + matcher + proxy into onRequest.
 *
 * If no config file and no VECTOR_URL → no-op (all routes local).
 * If matched service = "local" → fall through to Elysia handlers.
 * If matched service has a URL → proxy to upstream.
 */
import { Elysia } from 'elysia';
import { loadGatewayConfig, type GatewayConfig } from './config.ts';
import { compileRoutes, matchRoute, type CompiledRoute } from './matcher.ts';
import { proxyToService } from './proxy.ts';

export { loadGatewayConfig, compileRoutes, matchRoute, proxyToService };
export type { GatewayConfig, CompiledRoute };

export function gatewayPlugin(dataDir: string, vectorUrl?: string) {
  const config = loadGatewayConfig(dataDir, vectorUrl);

  if (!config) {
    // No gateway config — all routes handled locally
    return new Elysia({ name: 'gateway' });
  }

  const compiled = compileRoutes(config.routes);
  console.log(
    `[Gateway] Loaded ${config.routes.length} route(s), ${Object.keys(config.services).length} service(s)`,
  );

  return new Elysia({ name: 'gateway' })
    .get('/api/gateway/status', () => ({
      enabled: true,
      routes: config.routes.length,
      services: Object.fromEntries(
        Object.entries(config.services).map(([k, v]) => [k, { url: v.url, timeout: v.timeout }]),
      ),
    }))
    .onRequest(({ request }) => {
      const url = new URL(request.url);
      const match = matchRoute(url.pathname, compiled);
      if (!match) return; // no match — fall through to local Elysia routes

      const service = config.services[match.service];
      if (!service || match.service === 'local') return; // "local" = handle locally

      return proxyToService(request, service);
    });
}
