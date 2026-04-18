/**
 * Pre-index secret scanner — walk vault markdown files and flag likely
 * secrets (API keys, tokens, private keys, credential-ish env assignments)
 * before they land in the FTS5 index.
 */

import fs from 'fs';
import path from 'path';

export interface Finding {
  file: string;
  line: number;
  kind: string;
  preview: string;
}

const PATTERNS: { kind: string; re: RegExp }[] = [
  { kind: 'github-pat', re: /\b(ghp|gho|ghs|ghu|ghr)_[A-Za-z0-9]{20,}\b/ },
  { kind: 'aws-access-key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { kind: 'openai-key', re: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { kind: 'private-key', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  {
    kind: 'env-credential',
    re: /\b(?:API[_-]?KEY|SECRET|TOKEN|PASSWORD|PASSWD)\s*[:=]\s*['"]?([A-Za-z0-9_\-./+=]{16,})/i,
  },
];

function walk(dir: string, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.isFile() && e.name.endsWith('.md')) out.push(full);
  }
}

export function scanFile(file: string): Finding[] {
  const findings: Finding[] = [];
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return findings;
  }
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { kind, re } of PATTERNS) {
      const m = line.match(re);
      if (m) {
        findings.push({
          file,
          line: i + 1,
          kind,
          preview: line.trim().slice(0, 120),
        });
        break;
      }
    }
  }
  return findings;
}

export function scanRoots(roots: string[]): Finding[] {
  const files: string[] = [];
  for (const root of roots) {
    if (fs.existsSync(root)) walk(root, files);
  }
  const all: Finding[] = [];
  for (const f of files) all.push(...scanFile(f));
  return all;
}
