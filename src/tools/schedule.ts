/**
 * Oracle Schedule Handler
 *
 * Add appointments to the shared schedule file (~/.oracle/ψ/inbox/schedule.md).
 * Upserts a single document in the DB for search indexing.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { oracleDocuments } from '../db/schema.ts';
import type { ToolContext, ToolResponse, OracleScheduleAddInput, OracleScheduleListInput } from './types.ts';

const SCHEDULE_ID = 'schedule_main';
const SCHEDULE_REL = 'ψ/inbox/schedule.md';

function getSchedulePath(): string {
  return path.join(os.homedir(), '.oracle', SCHEDULE_REL);
}

export const scheduleAddToolDef = {
  name: 'oracle_schedule_add',
  description: 'Add an appointment or event to the shared schedule. The schedule is per-human (not per-project) and shared across all Oracles via ~/.oracle/ψ/inbox/schedule.md.',
  inputSchema: {
    type: 'object',
    properties: {
      date: {
        type: 'string',
        description: 'Date of the event (e.g. "5 Mar", "2026-03-05", "28 ก.พ.")'
      },
      event: {
        type: 'string',
        description: 'Event description (e.g. "นัดอ.เศรษฐ์", "Team standup")'
      },
      time: {
        type: 'string',
        description: 'Optional time (e.g. "14:00", "TBD")'
      },
      notes: {
        type: 'string',
        description: 'Optional notes about the event'
      }
    },
    required: ['date', 'event']
  }
};

export const scheduleListToolDef = {
  name: 'oracle_schedule_list',
  description: 'List upcoming appointments from the shared schedule. Returns the full schedule markdown or filtered by keyword.',
  inputSchema: {
    type: 'object',
    properties: {
      filter: {
        type: 'string',
        description: 'Optional keyword to filter events (e.g. "march", "เศรษฐ์", "workshop")'
      }
    }
  }
};

export async function handleScheduleList(_ctx: ToolContext, input: OracleScheduleListInput): Promise<ToolResponse> {
  const schedulePath = getSchedulePath();

  if (!fs.existsSync(schedulePath)) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ schedule: null, message: 'No schedule file found at ~/.oracle/ψ/inbox/schedule.md' }, null, 2)
      }]
    };
  }

  const content = fs.readFileSync(schedulePath, 'utf-8');

  if (input.filter) {
    // Filter lines containing the keyword (case-insensitive)
    const keyword = input.filter.toLowerCase();
    const lines = content.split('\n');
    const matched = lines.filter(line =>
      line.toLowerCase().includes(keyword) || line.startsWith('#') || line.startsWith('|--')
    );
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          filter: input.filter,
          results: matched.join('\n'),
          total_lines: matched.filter(l => l.startsWith('|') && !l.startsWith('|--')).length
        }, null, 2)
      }]
    };
  }

  return {
    content: [{
      type: 'text',
      text: content
    }]
  };
}

export async function handleScheduleAdd(ctx: ToolContext, input: OracleScheduleAddInput): Promise<ToolResponse> {
  const { date, event, time, notes } = input;
  const schedulePath = getSchedulePath();

  // Ensure directory exists
  fs.mkdirSync(path.dirname(schedulePath), { recursive: true });

  // Read existing content or create new
  let content: string;
  if (fs.existsSync(schedulePath)) {
    content = fs.readFileSync(schedulePath, 'utf-8');
  } else {
    content = `# Schedule\n\n**Updated**: ${new Date().toISOString().slice(0, 10)}\n`;
  }

  // Build the new row
  const timeStr = time || 'TBD';
  const notesStr = notes || '';
  const newRow = `| ${date} | ${timeStr} | ${event} | ${notesStr} |`;

  // Find the right section to append to, or create one
  // Look for the most recent month table (pattern: ## Month Year ... | Date | ...)
  const monthMatch = content.match(/^(## .+\n\n\|[^\n]+\n\|[-| ]+\n)((?:\|[^\n]+\n)*)/m);
  if (monthMatch) {
    // Append to existing month table
    const tableEnd = content.indexOf(monthMatch[0]) + monthMatch[0].length;
    content = content.slice(0, tableEnd) + newRow + '\n' + content.slice(tableEnd);
  } else {
    // No table found — append a new section
    const now = new Date();
    const monthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const section = `\n## ${monthName}\n\n| Date | Time | Event | Notes |\n|------|------|-------|-------|\n${newRow}\n`;
    content += section;
  }

  // Update the "Updated" line
  const today = new Date().toISOString().slice(0, 10);
  content = content.replace(/\*\*Updated\*\*:.*/, `**Updated**: ${today}`);

  // Write the file
  fs.writeFileSync(schedulePath, content, 'utf-8');

  // Upsert into oracle_documents (single row for the whole schedule)
  const now = Date.now();
  ctx.db.insert(oracleDocuments).values({
    id: SCHEDULE_ID,
    type: 'schedule',
    sourceFile: SCHEDULE_REL,
    concepts: JSON.stringify(['schedule', 'appointments', 'calendar']),
    createdAt: now,
    updatedAt: now,
    indexedAt: now,
    origin: null,
    project: null,  // universal, not per-project
    createdBy: 'oracle_schedule_add',
  }).onConflictDoUpdate({
    target: oracleDocuments.id,
    set: {
      updatedAt: now,
      indexedAt: now,
    }
  }).run();

  // Upsert FTS5 row
  ctx.sqlite.prepare(`
    INSERT OR REPLACE INTO oracle_fts (id, content, concepts)
    VALUES (?, ?, ?)
  `).run(SCHEDULE_ID, content, 'schedule appointments calendar');

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        file: schedulePath,
        added: { date, event, time: timeStr, notes: notesStr },
        message: 'Appointment added to shared schedule'
      }, null, 2)
    }]
  };
}
