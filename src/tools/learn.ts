/**
 * Oracle Learn Handler
 *
 * Add new patterns/learnings to the knowledge base.
 * Exports normalizeProject and extractProjectFromSource for testability.
 */

import path from 'path';
import fs from 'fs';
import { oracleDocuments } from '../db/schema.ts';
import { detectProject } from '../server/project-detect.ts';
import { getVaultPsiRoot } from '../vault/handler.ts';
import type { ToolContext, ToolResponse, OracleLearnInput } from './types.ts';

// ============================================================================
// TTL Helpers (Issue #4)
// ============================================================================

/** Default TTL by title pattern prefix */
const TTL_PATTERNS: [RegExp, number][] = [
  [/^\[score-output\]/i, 7],
  [/^\[infra-health\]/i, 7],
  [/^\[remediation-audit\]/i, 14],
  [/^\[daily-goal\]/i, 7],
  [/^\[goal-carryover\]/i, 7],
  [/^\[retro\]/i, 30],
];

/** Parse TTL string like "7d" → number of days, or null if invalid */
export function parseTtl(ttl: string | undefined | null): number | null {
  if (!ttl) return null;
  const match = ttl.match(/^(\d+)d$/);
  if (!match) return null;
  const days = parseInt(match[1], 10);
  return days > 0 ? days : null;
}

/** Get default TTL in days based on title pattern prefix, or null for permanent */
export function defaultTtlDays(title: string): number | null {
  for (const [pattern, days] of TTL_PATTERNS) {
    if (pattern.test(title)) return days;
  }
  return null;
}

/** Coerce concepts to string[] — handles string, array, or undefined from MCP input */
export function coerceConcepts(concepts: unknown): string[] {
  if (Array.isArray(concepts)) return concepts.map(String);
  if (typeof concepts === 'string') return concepts.split(',').map(s => s.trim()).filter(Boolean);
  return [];
}

export const learnToolDef = {
  name: 'arra_learn',
  description: 'Add a new pattern or learning to the Oracle knowledge base. Creates a markdown file in ψ/memory/learnings/ and indexes it.',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'The pattern or learning to add (can be multi-line)'
      },
      source: {
        type: 'string',
        description: 'Optional source attribution (defaults to "Oracle Learn")'
      },
      concepts: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional concept tags (e.g., ["git", "safety", "trust"])'
      },
      project: {
        type: 'string',
        description: 'Source project. Accepts: "github.com/owner/repo", "owner/repo", local path with ghq/Code prefix, or GitHub URL. Auto-normalized to "github.com/owner/repo" format.'
      },
      ttl: {
        type: 'string',
        description: 'Optional TTL for auto-expiry (e.g. "7d", "14d", "30d"). Auto-assigned by title pattern if omitted: [score-output]=7d, [infra-health]=7d, [remediation-audit]=14d, [daily-goal]=7d, [goal-carryover]=7d, [retro]=30d. No TTL = permanent.'
      }
    },
    required: ['pattern']
  }
};

// ============================================================================
// Pure helper functions (exported for testing)
// ============================================================================

/**
 * Normalize project input to "github.com/owner/repo" format.
 * Accepts: github.com/owner/repo, owner/repo, GitHub URLs, local ghq paths.
 */
export function normalizeProject(input?: string): string | null {
  if (!input) return null;

  // Already normalized
  if (input.match(/^github\.com\/[^\/]+\/[^\/]+$/)) {
    return input.toLowerCase();
  }

  // GitHub URL
  const urlMatch = input.match(/https?:\/\/github\.com\/([^\/]+\/[^\/]+)/);
  if (urlMatch) return `github.com/${urlMatch[1].replace(/\.git$/, '')}`.toLowerCase();

  // Local path with github.com
  const pathMatch = input.match(/github\.com\/([^\/]+\/[^\/]+)/);
  if (pathMatch) return `github.com/${pathMatch[1]}`.toLowerCase();

  // Short format: owner/repo
  const shortMatch = input.match(/^([^\/\s]+\/[^\/\s]+)$/);
  if (shortMatch) return `github.com/${shortMatch[1]}`.toLowerCase();

  return null;
}

/**
 * Extract project from source field (fallback).
 * Handles "arra_learn from github.com/owner/repo" and "rrr: org/repo" formats.
 */
export function extractProjectFromSource(source?: string): string | null {
  if (!source) return null;

  const oracleLearnMatch = source.match(/from\s+(github\.com\/[^\/\s]+\/[^\/\s]+)/);
  if (oracleLearnMatch) return oracleLearnMatch[1].toLowerCase();

  const rrrMatch = source.match(/^rrr:\s*([^\/\s]+\/[^\/\s]+)/);
  if (rrrMatch) return `github.com/${rrrMatch[1]}`.toLowerCase();

  const directMatch = source.match(/(github\.com\/[^\/\s]+\/[^\/\s]+)/);
  if (directMatch) return directMatch[1].toLowerCase();

  return null;
}

// ============================================================================
// Handler
// ============================================================================

export async function handleLearn(ctx: ToolContext, input: OracleLearnInput): Promise<ToolResponse> {
  const { pattern, source, concepts, project: projectInput, ttl } = input;
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];

  const slug = pattern
    .substring(0, 50)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const filename = `${dateStr}_${slug}.md`;

  // Resolve vault root for central writes
  const vault = getVaultPsiRoot();
  if ('needsInit' in vault) console.error(`[Vault] ${vault.hint}`);
  const vaultRoot = 'path' in vault ? vault.path : null;

  const project = normalizeProject(projectInput)
    || extractProjectFromSource(source)
    || detectProject(ctx.repoRoot);
  const projectDir = (project || '_universal').toLowerCase();

  let filePath: string;
  let sourceFileRel: string;
  if (vaultRoot) {
    const dir = path.join(vaultRoot, projectDir, 'ψ', 'memory', 'learnings');
    fs.mkdirSync(dir, { recursive: true });
    filePath = path.join(dir, filename);
    sourceFileRel = `${projectDir}/ψ/memory/learnings/${filename}`;
  } else {
    const dir = path.join(ctx.repoRoot, 'ψ/memory/learnings');
    fs.mkdirSync(dir, { recursive: true });
    filePath = path.join(dir, filename);
    sourceFileRel = `ψ/memory/learnings/${filename}`;
  }

  if (fs.existsSync(filePath)) {
    throw new Error(`File already exists: ${filename}`);
  }

  const title = pattern.split('\n')[0].substring(0, 80);
  const conceptsList = coerceConcepts(concepts);
  const ttlDays = parseTtl(ttl) ?? defaultTtlDays(pattern);
  const expiresAt = ttlDays ? now.getTime() + (ttlDays * 86400000) : null;
  const frontmatter = [
    '---',
    `title: ${title}`,
    conceptsList.length > 0 ? `tags: [${conceptsList.join(', ')}]` : 'tags: []',
    `created: ${dateStr}`,
    `source: ${source || 'Oracle Learn'}`,
    ...(project ? [`project: ${project}`] : []),
    ...(ttlDays ? [`ttl: ${ttlDays}d`] : []),
    ...(expiresAt ? [`expires: ${new Date(expiresAt).toISOString().split('T')[0]}`] : []),
    '---',
    '',
    `# ${title}`,
    '',
    pattern,
    '',
    '---',
    '*Added via Oracle Learn*',
    ''
  ].join('\n');

  fs.writeFileSync(filePath, frontmatter, 'utf-8');

  const id = `learning_${dateStr}_${slug}`;

  ctx.db.insert(oracleDocuments).values({
    id,
    type: 'learning',
    sourceFile: sourceFileRel,
    concepts: JSON.stringify(conceptsList),
    createdAt: now.getTime(),
    updatedAt: now.getTime(),
    indexedAt: now.getTime(),
    origin: null,
    project,
    createdBy: 'arra_learn',
    expiresAt,
    ttlDays,
  }).run();

  ctx.sqlite.prepare(`
    INSERT INTO oracle_fts (id, content, concepts)
    VALUES (?, ?, ?)
  `).run(id, frontmatter, conceptsList.join(' '));

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        file: sourceFileRel,
        id,
        ...(ttlDays ? { ttl: `${ttlDays}d`, expires_at: new Date(expiresAt!).toISOString() } : {}),
        message: `Pattern added to Oracle knowledge base${vaultRoot ? ' (vault)' : ''}${ttlDays ? ` (expires in ${ttlDays} days)` : ''}`
      }, null, 2)
    }]
  };
}
