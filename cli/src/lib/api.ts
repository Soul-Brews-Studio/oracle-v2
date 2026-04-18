/**
 * ARRA Oracle HTTP API helper for neo-arra plugins.
 *
 * Reads NEO_ARRA_API env (default http://localhost:47778).
 * Note: issue #770 spec listed 3457 — real oracle default is 47778 (ORACLE_DEFAULT_PORT).
 * Override: NEO_ARRA_API=http://localhost:47778 neo-arra <cmd>
 */

export const BASE_URL = (process.env.NEO_ARRA_API ?? "http://localhost:47778").replace(/\/$/, "");

export async function apiFetch(path: string, opts?: RequestInit): Promise<Response> {
  const url = `${BASE_URL}${path}`;
  try {
    return await fetch(url, opts);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Cannot reach ARRA Oracle at ${BASE_URL}\n` +
      `  → Is the server running? Try: bun run server  (in arra-oracle-v3 repo)\n` +
      `  → Or set NEO_ARRA_API=http://localhost:<port> to point to the right host\n` +
      `  Original: ${msg}`
    );
  }
}
