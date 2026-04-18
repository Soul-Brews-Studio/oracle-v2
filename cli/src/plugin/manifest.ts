import type { PluginManifest } from "./types.ts";

export function parseManifest(raw: unknown): PluginManifest {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("manifest must be a JSON object");
  }
  return raw as PluginManifest;
}

export function validateManifest(m: PluginManifest): void {
  if (!m.name || !/^[a-z0-9-]+$/.test(m.name)) {
    throw new Error(`manifest.name must match /^[a-z0-9-]+$/, got: ${JSON.stringify(m.name)}`);
  }
  if (!m.version || !/^\d+\.\d+\.\d+/.test(m.version)) {
    throw new Error(`manifest.version must be semver, got: ${JSON.stringify(m.version)}`);
  }
  if (!m.entry || typeof m.entry !== "string") {
    throw new Error(`manifest.entry must be a string path`);
  }
  if (!m.sdk || typeof m.sdk !== "string") {
    throw new Error(`manifest.sdk must be a semver range string`);
  }
}
