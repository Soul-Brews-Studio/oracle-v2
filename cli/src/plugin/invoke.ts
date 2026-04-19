import type { LoadedPlugin, InvokeContext, InvokeResult } from "./types.ts";

const TIMEOUT_MS = Number(process.env.ARRA_PLUGIN_TIMEOUT_MS ?? 5000);

export async function invokePlugin(plugin: LoadedPlugin, ctx: InvokeContext): Promise<InvokeResult> {
  try {
    const mod = await import(plugin.entryPath);
    const handler = mod.default;
    if (typeof handler !== "function") {
      return { ok: false, error: `plugin ${plugin.manifest.name}: default export must be a function` };
    }

    const result = await Promise.race([
      handler(ctx) as Promise<InvokeResult>,
      new Promise<InvokeResult>((_, reject) =>
        setTimeout(() => reject(new Error(`plugin ${plugin.manifest.name} timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS)
      ),
    ]);

    return result ?? { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
