import { sessionApiBase, sessionFetch } from "./session-api.ts";
import { emit } from "./_output.ts";

function flagValue(args: string[], name: string): string | undefined {
  const eq = args.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const idx = args.indexOf(name);
  if (idx >= 0 && idx + 1 < args.length) {
    const next = args[idx + 1];
    if (!next.startsWith("-")) return next;
  }
  return undefined;
}

const VALID_GROUPS = new Set(["main", "tools", "hidden", "admin"]);

export async function menuAdd(args: string[]): Promise<number> {
  const path = flagValue(args, "--path");
  const label = flagValue(args, "--label");
  const group = flagValue(args, "--group");
  const orderRaw = flagValue(args, "--order");
  const icon = flagValue(args, "--icon");

  if (!path || !label) {
    console.error(
      "usage: arra-cli menu add --path /foo --label Foo [--group tools] [--order 90] [--icon star]",
    );
    return 1;
  }

  if (group && !VALID_GROUPS.has(group)) {
    console.error(`invalid --group '${group}' (expected: main|tools|hidden|admin)`);
    return 1;
  }

  let order: number | undefined;
  if (orderRaw !== undefined) {
    const parsed = Number(orderRaw);
    if (!Number.isFinite(parsed)) {
      console.error(`invalid --order '${orderRaw}' (expected number)`);
      return 1;
    }
    order = parsed;
  }

  const body: Record<string, unknown> = { path, label };
  if (group) body.group = group;
  if (order !== undefined) body.order = order;
  if (icon) body.icon = icon;

  let res: Response;
  try {
    res = await sessionFetch("/api/menu/custom", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
  if (!res.ok) {
    const text = await res.text();
    console.error(`\x1b[31m✗\x1b[0m POST /api/menu/custom failed: HTTP ${res.status}`);
    if (text) console.error(`  ${text}`);
    return 1;
  }

  const data = (await res.json()) as { added?: boolean; replaced?: boolean; item?: unknown };
  emit({ api: sessionApiBase(), added: !!data.added, replaced: !!data.replaced, item: data.item }, args);
  return 0;
}
