import type { InvokeContext, InvokeResult } from "../../plugin/types.ts";

export default async function handler(_ctx: InvokeContext): Promise<InvokeResult> {
  console.log("Hello from arra-cli plugin hello!");
  return { ok: true };
}
