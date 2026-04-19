import { sessionApiBase, sessionFetch } from "./session-api.ts";
import { emit } from "./_output.ts";

export async function menuList(args: string[]): Promise<number> {
  const customOnly = args.includes("--custom");
  const endpoint = customOnly ? "/api/menu/custom" : "/api/menu";

  let res: Response;
  try {
    res = await sessionFetch(endpoint);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
  if (!res.ok) {
    console.error(`\x1b[31m✗\x1b[0m GET ${endpoint} failed: HTTP ${res.status}`);
    return 1;
  }

  const data = (await res.json()) as { items?: unknown[] };
  const items = Array.isArray(data.items) ? data.items : [];
  emit({ api: sessionApiBase(), endpoint, items }, args);
  return 0;
}
