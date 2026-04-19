import { sessionApiBase, sessionFetch } from "./session-api.ts";
import { emit } from "./_output.ts";

export async function menuRemove(args: string[]): Promise<number> {
  const target = args.find((a) => !a.startsWith("-"));
  if (!target) {
    console.error("usage: arra-cli menu remove <path>");
    return 1;
  }
  const normalized = target.startsWith("/") ? target : `/${target}`;
  const encoded = encodeURIComponent(normalized.replace(/^\//, ""));

  let res: Response;
  try {
    res = await sessionFetch(`/api/menu/custom/${encoded}`, { method: "DELETE" });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
  if (!res.ok && res.status !== 404) {
    console.error(`\x1b[31m✗\x1b[0m DELETE /api/menu/custom failed: HTTP ${res.status}`);
    return 1;
  }

  const data = (await res.json()) as { removed?: boolean; path?: string };
  if (!data.removed) {
    emit({ api: sessionApiBase(), removed: false, path: data.path ?? normalized }, args);
    return 1;
  }
  emit({ api: sessionApiBase(), removed: true, path: data.path ?? normalized }, args);
  return 0;
}
