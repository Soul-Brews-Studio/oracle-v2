import { sessionFetch } from "./session-api.ts";
import { emit } from "./_output.ts";

export async function sessionContext(args: string[]): Promise<number> {
  const id = args.find(a => !a.startsWith("-"));
  if (!id) {
    console.error("usage: arra-cli session context <id> [--yml]");
    return 1;
  }

  let res: Response;
  try {
    res = await sessionFetch(`/api/session/${encodeURIComponent(id)}/context`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
  if (!res.ok) {
    console.error(`\x1b[31m✗\x1b[0m session ${id}: HTTP ${res.status}`);
    if (res.status === 404) {
      console.error("  not found (or red's backend PR not yet merged)");
    }
    return 1;
  }

  const data = (await res.json()) as any;
  emit(data, args);
  return 0;
}
