// Minimal YAML frontmatter parser — just enough to read the arra_* keys
// the export plugin writes. Supports: scalars (quoted + bare), inline arrays
// [a, b, "c"], and numbers/booleans. Pure, no I/O.

import type { DocMeta } from './types.ts';

export interface ParsedFile {
  meta: DocMeta;
  body: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function parseFrontmatter(raw: string): ParsedFile {
  const m = FRONTMATTER_RE.exec(raw);
  if (!m) return { meta: {}, body: raw };
  const yamlBlock = m[1];
  const body = m[2] ?? '';
  const meta = parseYaml(yamlBlock);
  return { meta, body };
}

function parseYaml(block: string): DocMeta {
  const out: DocMeta = {};
  const lines = block.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.replace(/^\s+|\s+$/g, '');
    if (!line || line.startsWith('#')) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (!key) continue;
    out[key] = coerceScalar(value);
  }
  return out;
}

function coerceScalar(v: string): unknown {
  if (v === '') return '';
  if (v === 'null' || v === '~') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v);
  if (v.startsWith('[') && v.endsWith(']')) return parseInlineArray(v.slice(1, -1));
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return unquote(v);
  }
  return v;
}

function unquote(v: string): string {
  const q = v[0];
  const inner = v.slice(1, -1);
  if (q === '"') return inner.replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(/\\n/g, '\n');
  return inner.replace(/''/g, "'");
}

function parseInlineArray(inner: string): string[] {
  if (!inner.trim()) return [];
  const out: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (quote) {
      if (c === quote && inner[i - 1] !== '\\') {
        quote = null;
        continue;
      }
      cur += c;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === ',') {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.map((s) => s.replace(/^['"]|['"]$/g, ''));
}
