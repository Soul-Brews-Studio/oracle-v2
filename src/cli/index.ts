#!/usr/bin/env bun
/**
 * Oracle CLI - Unified human-facing interface
 *
 * Usage:
 *   oracle <command> [options]
 *
 * Commands:
 *   search <query>      Search the knowledge base
 *   learn               Add a new pattern/learning
 *   list                List documents
 *   stats               Show knowledge base statistics
 *   threads             List discussion threads
 *   thread <id>         View a thread
 *   schedule            View/manage scheduled events
 *   traces              List discovery traces
 *   trace <id>          View a trace
 *   inbox               View handoff inbox
 *   health              Check server health
 *   server              Manage Oracle HTTP server
 *   vault               Manage knowledge vault
 */

import { Command } from 'commander';
import fs from 'fs';
import path from 'path';

const pkg = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname || __dirname, '..', '..', 'package.json'), 'utf-8')
);

const program = new Command();
program
  .name('oracle')
  .description('Oracle CLI — unified knowledge management')
  .version(pkg.version);

// Error wrapper for all commands
const originalParse = program.parseAsync.bind(program);
program.parseAsync = async function (...args: any[]) {
  try {
    return await originalParse(...args);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${msg}`);
    process.exit(1);
  }
};

// Register all commands
import { registerHealth } from './commands/health.ts';
import { registerSearch } from './commands/search.ts';
import { registerLearn } from './commands/learn.ts';
import { registerList } from './commands/list.ts';
import { registerStats } from './commands/stats.ts';
import { registerThreads } from './commands/threads.ts';
import { registerSchedule } from './commands/schedule.ts';
import { registerTraces } from './commands/traces.ts';
import { registerInbox } from './commands/inbox.ts';
import { registerServer } from './commands/server.ts';
import { registerVault } from './commands/vault.ts';

registerHealth(program);
registerSearch(program);
registerLearn(program);
registerList(program);
registerStats(program);
registerThreads(program);
registerSchedule(program);
registerTraces(program);
registerInbox(program);
registerServer(program);
registerVault(program);

await program.parseAsync();
