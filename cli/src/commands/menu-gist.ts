import { sessionApiBase, sessionFetch } from "./session-api.ts";
import { emit } from "./_output.ts";

async function fetchJson(
  path: string,
  opts?: RequestInit,
): Promise<{ code: number; body: unknown; status: number } | { code: 1 }> {
  let res: Response;
  try {
    res = await sessionFetch(path, opts);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return { code: 1 };
  }
  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!res.ok) {
    console.error(`\x1b[31m✗\x1b[0m ${opts?.method ?? "GET"} ${path} failed: HTTP ${res.status}`);
    if (body && typeof body === "object" && "error" in (body as Record<string, unknown>)) {
      console.error(`  ${(body as { error: string }).error}`);
    } else if (typeof body === "string" && body) {
      console.error(`  ${body}`);
    }
    return { code: 1, body, status: res.status };
  }
  return { code: 0, body, status: res.status };
}

export async function menuGistStatus(args: string[]): Promise<number> {
  const result = await fetchJson("/api/menu/source");
  if (result.code !== 0) return 1;
  emit({ api: sessionApiBase(), source: result.body }, args);
  return 0;
}

export async function menuGistUrl(args: string[]): Promise<number> {
  const url = args.find((a) => !a.startsWith("-"));
  if (!url) {
    console.error("usage: arra-cli menu gist-url <url> [--override]");
    return 1;
  }
  const mode = args.includes("--override") ? "override" : "merge";
  const result = await fetchJson("/api/menu/source", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url, mode }),
  });
  if (result.code !== 0) return 1;
  const body = (result.body ?? {}) as { source?: unknown; mode?: string };
  emit(
    { api: sessionApiBase(), mode: body.mode ?? mode, source: body.source ?? body },
    args,
  );
  return 0;
}

export async function menuGistClear(args: string[]): Promise<number> {
  const result = await fetchJson("/api/menu/source", { method: "DELETE" });
  if (result.code !== 0) return 1;
  emit({ api: sessionApiBase(), cleared: true, source: result.body }, args);
  return 0;
}

export async function menuGistReload(args: string[]): Promise<number> {
  const result = await fetchJson("/api/menu/reload", { method: "POST" });
  if (result.code !== 0) return 1;
  emit({ api: sessionApiBase(), reloaded: true, source: result.body }, args);
  return 0;
}
