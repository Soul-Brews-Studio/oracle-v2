#!/usr/bin/env bun
/**
 * OpenAPI → MCP tool generator (prototype, Phase 1).
 *
 * Reads the Elysia swagger JSON and emits one MCP tool per (path, method).
 * Phase 1 only: generate + print. Does not wire into the live Server.
 *
 * Usage:
 *   bun scripts/mcp-from-openapi.ts [--url <url>] [--file <path>] [--pretty]
 *
 * Defaults: try http://localhost:$ORACLE_PORT/swagger/json, fall back to
 *           scripts/fixtures/swagger.sample.json.
 *
 * See docs/MCP-FROM-OPENAPI.md for mapping rules and next steps.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

type JsonSchema = Record<string, any>;

interface OpenApiParameter {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  required?: boolean;
  schema?: JsonSchema;
  description?: string;
}

interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OpenApiParameter[];
  requestBody?: {
    required?: boolean;
    content?: Record<string, { schema?: JsonSchema }>;
    description?: string;
  };
}

interface OpenApiDoc {
  openapi?: string;
  info?: { title?: string; version?: string };
  paths: Record<string, Record<string, OpenApiOperation>>;
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

function slugifyPath(path: string): string {
  return path
    .replace(/^\/+|\/+$/g, '')
    .replace(/^api\//, '')
    .replace(/\{([^}]+)\}/g, 'by_$1')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
}

function toolNameFor(path: string, method: HttpMethod, collisions: Set<string>): string {
  const slug = slugifyPath(path) || 'root';
  const base = `arra_${slug}`;
  if (!collisions.has(base)) {
    collisions.add(base);
    return base;
  }
  const prefixed = `arra_${method}_${slug}`;
  collisions.add(prefixed);
  return prefixed;
}

function parametersToSchema(params: OpenApiParameter[]): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];
  for (const p of params) {
    if (p.in !== 'query' && p.in !== 'path') continue;
    const propSchema: JsonSchema = { ...(p.schema ?? { type: 'string' }) };
    if (p.description) propSchema.description = p.description;
    if (p.in === 'path') {
      propSchema['x-param-in'] = 'path';
    }
    properties[p.name] = propSchema;
    if (p.required || p.in === 'path') required.push(p.name);
  }
  const schema: JsonSchema = { type: 'object', properties };
  if (required.length) schema.required = required;
  return schema;
}

function bodyToSchema(op: OpenApiOperation): JsonSchema | null {
  const body = op.requestBody;
  if (!body || !body.content) return null;
  const json = body.content['application/json'];
  if (!json) return null;
  const s = json.schema;
  if (!s || Object.keys(s).length === 0) {
    return { type: 'object', properties: {}, additionalProperties: true };
  }
  return s;
}

function mergeSchemas(paramSchema: JsonSchema, bodySchema: JsonSchema | null): JsonSchema {
  if (!bodySchema) return paramSchema;
  const merged: JsonSchema = {
    type: 'object',
    properties: { ...(paramSchema.properties ?? {}) },
  };
  const required = new Set<string>(paramSchema.required ?? []);

  if (bodySchema.type === 'object' && bodySchema.properties) {
    for (const [k, v] of Object.entries(bodySchema.properties as Record<string, JsonSchema>)) {
      merged.properties[k] = v;
    }
    for (const k of bodySchema.required ?? []) required.add(k);
    if (bodySchema.additionalProperties !== undefined) {
      merged.additionalProperties = bodySchema.additionalProperties;
    }
  } else {
    merged.properties.body = bodySchema;
    required.add('body');
  }
  if (required.size) merged.required = [...required];
  return merged;
}

function describeOp(path: string, method: HttpMethod, op: OpenApiOperation): string {
  const head = op.summary?.trim() || op.description?.trim();
  const route = `${method.toUpperCase()} ${path}`;
  return head ? `${head} (${route})` : route;
}

function generateTools(doc: OpenApiDoc): Tool[] {
  const tools: Tool[] = [];
  const seen = new Set<string>();

  for (const [path, methods] of Object.entries(doc.paths)) {
    for (const method of HTTP_METHODS) {
      const op = methods[method];
      if (!op) continue;
      const name = toolNameFor(path, method, seen);
      const paramSchema = parametersToSchema(op.parameters ?? []);
      const bodySchema = bodyToSchema(op);
      const inputSchema = mergeSchemas(paramSchema, bodySchema);
      tools.push({
        name,
        description: describeOp(path, method, op),
        inputSchema: inputSchema as Tool['inputSchema'],
      });
    }
  }
  return tools;
}

async function loadSpec(opts: { url?: string; file?: string }): Promise<OpenApiDoc> {
  if (opts.file) {
    return JSON.parse(readFileSync(opts.file, 'utf-8')) as OpenApiDoc;
  }
  const url = opts.url ?? `http://localhost:${process.env.ORACLE_PORT ?? '47778'}/swagger/json`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const ct = res.headers.get('content-type') ?? '';
      if (ct.includes('json')) return (await res.json()) as OpenApiDoc;
    }
    throw new Error(`bad response: ${res.status}`);
  } catch (err) {
    const here = dirname(fileURLToPath(import.meta.url));
    const fixture = resolve(here, 'fixtures/swagger.sample.json');
    if (!existsSync(fixture)) throw err;
    console.error(`[mcp-from-openapi] live fetch failed (${(err as Error).message}); using fixture: ${fixture}`);
    return JSON.parse(readFileSync(fixture, 'utf-8')) as OpenApiDoc;
  }
}

function parseArgs(argv: string[]): { url?: string; file?: string; pretty: boolean } {
  const out: { url?: string; file?: string; pretty: boolean } = { pretty: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') out.url = argv[++i];
    else if (a === '--file') out.file = argv[++i];
    else if (a === '--compact') out.pretty = false;
    else if (a === '--pretty') out.pretty = true;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const doc = await loadSpec(args);
  const tools = generateTools(doc);

  const CURRENT_TOOL_COUNT = 22;
  process.stdout.write(JSON.stringify(tools, null, args.pretty ? 2 : 0) + '\n');
  console.error(`[mcp-from-openapi] generated ${tools.length} tools from ${Object.keys(doc.paths).length} paths`);
  console.error(`[mcp-from-openapi] current hand-rolled src/index.ts emits ${CURRENT_TOOL_COUNT} tools`);
  if (tools.length < CURRENT_TOOL_COUNT) {
    console.error(`[mcp-from-openapi] WARN: generated count (${tools.length}) is below current (${CURRENT_TOOL_COUNT})`);
    process.exit(2);
  }
}

main().catch((err) => {
  console.error('[mcp-from-openapi] fatal:', err);
  process.exit(1);
});
