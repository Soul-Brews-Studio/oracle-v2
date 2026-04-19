import { sessionApiBase, sessionFetch } from "./session-api.ts";
import { emit } from "./_output.ts";

export async function sessionList(args: string[]): Promise<number> {
  let res: Response;
  try {
    res = await sessionFetch("/api/sessions");
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
  if (!res.ok) {
    console.error(`\x1b[31m✗\x1b[0m GET /api/sessions failed: HTTP ${res.status}`);
    if (res.status === 404) {
      console.error("  endpoint not found — requires red's backend PR merged first");
    }
    return 1;
  }

  const data = (await res.json()) as any;
  const sessions: any[] = data.sessions ?? data.results ?? (Array.isArray(data) ? data : []);

  emit({ api: sessionApiBase(), sessions }, args);
  return 0;
}
