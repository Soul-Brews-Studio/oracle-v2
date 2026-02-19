/**
 * Oracle Learn Handler
 *
 * Add new patterns/learnings to the knowledge base.
 * Exports normalizeProject and extractProjectFromSource for testability.
 */

import path from 'path';
import fs from 'fs';
import { oracleDocuments } from '../db/schema.js';
import { detectProject } from '../server/project-detect.js';
import type { ToolContext, ToolResponse, OracleLearnInput } from './types.js';

export const learnToolDef = {
  name: 'oracle_learn',
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
    return input;
  }

  // GitHub URL
  const urlMatch = input.match(/https?:\/\/github\.com\/([^\/]+\/[^\/]+)/);
  if (urlMatch) return `github.com/${urlMatch[1].replace(/\.git$/, '')}`;

  // Local path with github.com
  const pathMatch = input.match(/github\.com\/([^\/]+\/[^\/]+)/);
  if (pathMatch) return `github.com/${pathMatch[1]}`;

  // Short format: owner/repo
  const shortMatch = input.match(/^([^\/\s]+\/[^\/\s]+)$/);
  if (shortMatch) return `github.com/${shortMatch[1]}`;

  return null;
}

/**
 * Extract project from source field (fallback).
 * Handles "oracle_learn from github.com/owner/repo" and "rrr: org/repo" formats.
 */
export function extractProjectFromSource(source?: string): string | null {
  if (!source) return null;

  const oracleLearnMatch = source.match(/from\s+(github\.com\/[^\/\s]+\/[^\/\s]+)/);
  if (oracleLearnMatch) return oracleLearnMatch[1];

  const rrrMatch = source.match(/^rrr:\s*([^\/\s]+\/[^\/\s]+)/);
  if (rrrMatch) return `github.com/${rrrMatch[1]}`;

  const directMatch = source.match(/(github\.com\/[^\/\s]+\/[^\/\s]+)/);
  if (directMatch) return directMatch[1];

  return null;
}

// ============================================================================
// Handler
// ============================================================================

export async function handleLearn(ctx: ToolContext, input: OracleLearnInput): Promise<ToolResponse> {
  const { pattern, source, concepts, project: projectInput } = input;
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
  const filePath = path.join(ctx.repoRoot, 'ψ/memory/learnings', filename);

  if (fs.existsSync(filePath)) {
    throw new Error(`File already exists: ${filename}`);
  }

  const title = pattern.split('\n')[0].substring(0, 80);
  const conceptsList = concepts || [];
  const frontmatter = [
    '---',
    `title: ${title}`,
    conceptsList.length > 0 ? `tags: [${conceptsList.join(', ')}]` : 'tags: []',
    `created: ${dateStr}`,
    `source: ${source || 'Oracle Learn'}`,
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
  const project = normalizeProject(projectInput)
    || extractProjectFromSource(source)
    || detectProject(ctx.repoRoot);

  ctx.db.insert(oracleDocuments).values({
    id,
    type: 'learning',
    sourceFile: `ψ/memory/learnings/${filename}`,
    concepts: JSON.stringify(conceptsList),
    createdAt: now.getTime(),
    updatedAt: now.getTime(),
    indexedAt: now.getTime(),
    origin: null,
    project,
    createdBy: 'oracle_learn',
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
        file: `ψ/memory/learnings/${filename}`,
        id,
        message: `Pattern added to Oracle knowledge base`
      }, null, 2)
    }]
  };
}
