/**
 * Oracle Handoff Handler
 *
 * Write session context to ψ/inbox/handoff/ for future sessions.
 */

import path from 'path';
import fs from 'fs';
import type { ToolContext, ToolResponse, OracleHandoffInput } from './types.js';

export const handoffToolDef = {
  name: 'oracle_handoff',
  description: 'Write session context to the Oracle inbox for future sessions to pick up. Creates a timestamped markdown file in ψ/inbox/handoff/. Use at end of sessions to preserve context.',
  inputSchema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'The handoff content (markdown). Include context, progress, next steps.'
      },
      slug: {
        type: 'string',
        description: 'Optional slug for the filename. Auto-generated from content if not provided.'
      }
    },
    required: ['content']
  }
};

export async function handleHandoff(ctx: ToolContext, input: OracleHandoffInput): Promise<ToolResponse> {
  const { content, slug: slugInput } = input;
  const now = new Date();

  const dateStr = now.toISOString().split('T')[0];
  const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;

  const slug = slugInput || content
    .substring(0, 50)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'handoff';

  const filename = `${dateStr}_${timeStr}_${slug}.md`;
  const dirPath = path.join(ctx.repoRoot, 'ψ/inbox/handoff');
  const filePath = path.join(dirPath, filename);

  fs.mkdirSync(dirPath, { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');

  console.error(`[MCP:HANDOFF] Written: ${filename}`);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        file: `ψ/inbox/handoff/${filename}`,
        message: `Handoff written. Next session can read it with oracle_inbox().`
      }, null, 2)
    }]
  };
}
