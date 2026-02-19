/**
 * Oracle Nightly MCP Server
 *
 * Slim entry point: server lifecycle, tool registration, and routing.
 * Handler implementations live in src/tools/.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { Database } from 'bun:sqlite';
import { drizzle, BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import * as schema from './db/schema.js';
import { ChromaMcpClient } from './chroma-mcp.js';
import path from 'path';
import fs from 'fs';

// Forum handlers (already extracted)
import {
  handleThreadMessage,
  listThreads,
  getFullThread,
  getMessages,
  updateThreadStatus,
} from './forum/handler.js';

// Trace handlers (already extracted)
import {
  createTrace,
  getTrace,
  listTraces,
  getTraceChain,
  linkTraces,
  unlinkTraces,
  getTraceLinkedChain,
} from './trace/handler.js';

import type {
  CreateTraceInput,
  ListTracesInput,
  GetTraceInput,
} from './trace/types.js';

import { ensureServerRunning } from './ensure-server.js';

// Tool handlers (extracted in this refactor)
import type { ToolContext } from './tools/types.js';
import {
  searchToolDef, handleSearch,
  learnToolDef, handleLearn,
  reflectToolDef, handleReflect,
  listToolDef, handleList,
  statsToolDef, handleStats,
  conceptsToolDef, handleConcepts,
  supersedeToolDef, handleSupersede,
  handoffToolDef, handleHandoff,
  inboxToolDef, handleInbox,
  verifyToolDef, handleVerify,
} from './tools/index.js';

import type {
  OracleSearchInput,
  OracleLearnInput,
  OracleListInput,
  OracleStatsInput,
  OracleConceptsInput,
  OracleReflectInput,
  OracleSupersededInput,
  OracleHandoffInput,
  OracleInboxInput,
  OracleVerifyInput,
} from './tools/types.js';

// Interfaces for forum/trace (not yet extracted to tools/)
interface OracleThreadInput {
  message: string;
  threadId?: number;
  title?: string;
  role?: 'human' | 'claude';
  model?: string;
}

interface OracleThreadsInput {
  status?: 'active' | 'answered' | 'pending' | 'closed';
  limit?: number;
  offset?: number;
}

interface OracleThreadReadInput {
  threadId: number;
  limit?: number;
}

interface OracleThreadUpdateInput {
  threadId: number;
  status?: 'active' | 'closed' | 'answered' | 'pending';
}

// Write tools that should be disabled in read-only mode
const WRITE_TOOLS = [
  'oracle_learn',
  'oracle_thread',
  'oracle_thread_update',
  'oracle_trace',
  'oracle_supersede',
  'oracle_handoff',
];

class OracleMCPServer {
  private server: Server;
  private sqlite: Database;
  private db: BunSQLiteDatabase<typeof schema>;
  private repoRoot: string;
  private chromaMcp: ChromaMcpClient;
  private chromaStatus: 'unknown' | 'connected' | 'unavailable' = 'unknown';
  private readOnly: boolean;
  private version: string;

  constructor(options: { readOnly?: boolean } = {}) {
    this.readOnly = options.readOnly ?? false;
    if (this.readOnly) {
      console.error('[Oracle] Running in READ-ONLY mode');
    }
    this.repoRoot = process.env.ORACLE_REPO_ROOT || process.cwd();

    const homeDir = process.env.HOME || process.env.USERPROFILE || '/tmp';

    const chromaPath = path.join(homeDir, '.chromadb');
    this.chromaMcp = new ChromaMcpClient('oracle_knowledge', chromaPath, '3.12');

    const pkg = JSON.parse(fs.readFileSync(path.join(import.meta.dirname || __dirname, '..', 'package.json'), 'utf-8'));
    this.version = pkg.version;
    this.server = new Server(
      { name: 'oracle-nightly', version: this.version },
      { capabilities: { tools: {} } }
    );

    const oracleDataDir = process.env.ORACLE_DATA_DIR || path.join(homeDir, '.oracle-v2');
    const dbPath = process.env.ORACLE_DB_PATH || path.join(oracleDataDir, 'oracle.db');
    this.sqlite = new Database(dbPath);
    this.db = drizzle(this.sqlite, { schema });

    this.setupHandlers();
    this.setupErrorHandling();
    this.verifyChromaHealth();
  }

  /** Build ToolContext from server state */
  private get toolCtx(): ToolContext {
    return {
      db: this.db,
      sqlite: this.sqlite,
      repoRoot: this.repoRoot,
      chromaMcp: this.chromaMcp,
      chromaStatus: this.chromaStatus,
      version: this.version,
    };
  }

  private async verifyChromaHealth(): Promise<void> {
    try {
      const stats = await this.chromaMcp.getStats();
      if (stats.count > 0) {
        this.chromaStatus = 'connected';
        console.error(`[ChromaDB] ✓ oracle_knowledge: ${stats.count} documents`);
      } else {
        this.chromaStatus = 'connected';
        console.error('[ChromaDB] ✓ Connected but collection empty');
      }
    } catch (e) {
      this.chromaStatus = 'unavailable';
      console.error('[ChromaDB] ✗ Cannot connect:', e instanceof Error ? e.message : String(e));
    }
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.cleanup();
      process.exit(0);
    });
  }

  private async cleanup(): Promise<void> {
    this.sqlite.close();
    await this.chromaMcp.close();
  }

  private setupHandlers(): void {
    // ================================================================
    // List available tools
    // ================================================================
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const allTools = [
        // Meta-documentation tool
        {
          name: '____IMPORTANT',
          description: `ORACLE WORKFLOW GUIDE (v${this.version}):\n\n1. SEARCH & DISCOVER\n   oracle_search(query) → Find knowledge by keywords/vectors\n   oracle_list() → Browse all documents\n   oracle_concepts() → See topic coverage\n\n2. REFLECT\n   oracle_reflect() → Random wisdom for alignment\n\n3. LEARN & REMEMBER\n   oracle_learn(pattern) → Add new patterns/learnings\n   oracle_thread(message) → Multi-turn discussions\n   ⚠️ BEFORE adding: search for similar topics first!\n   If updating old info → use oracle_supersede(oldId, newId)\n\n4. TRACE & DISTILL\n   oracle_trace(query) → Log discovery sessions with dig points\n   oracle_trace_list() → Find past traces\n   oracle_trace_get(id) → Explore dig points (files, commits, issues)\n   oracle_trace_link(prevId, nextId) → Chain related traces together\n   oracle_trace_chain(id) → View the full linked chain\n\n5. HANDOFF & INBOX\n   oracle_handoff(content) → Save session context for next session\n   oracle_inbox() → List pending handoffs\n\n6. SUPERSEDE (when info changes)\n   oracle_supersede(oldId, newId, reason) → Mark old doc as outdated\n   "Nothing is Deleted" — old preserved, just marked superseded\n\n7. VERIFY (health check)\n   oracle_verify(check?) → Compare ψ/ files vs DB index\n   check=true (default): read-only report\n   check=false: also flag orphaned entries\n\nPhilosophy: "Nothing is Deleted" — All interactions logged.`,
          inputSchema: { type: 'object', properties: {} }
        },
        // Core tools (from src/tools/)
        searchToolDef,
        reflectToolDef,
        learnToolDef,
        listToolDef,
        statsToolDef,
        conceptsToolDef,
        // Forum tools
        {
          name: 'oracle_thread',
          description: 'Send a message to an Oracle discussion thread. Creates a new thread or continues an existing one. Oracle auto-responds from knowledge base. Use for multi-turn consultations.',
          inputSchema: {
            type: 'object',
            properties: {
              message: { type: 'string', description: 'Your question or message' },
              threadId: { type: 'number', description: 'Thread ID to continue (omit to create new thread)' },
              title: { type: 'string', description: 'Title for new thread (defaults to first 50 chars of message)' },
              role: { type: 'string', enum: ['human', 'claude'], description: 'Who is sending (default: human)', default: 'human' },
              model: { type: 'string', description: 'Model name for Claude calls (e.g., "opus", "sonnet")' },
            },
            required: ['message']
          }
        },
        {
          name: 'oracle_threads',
          description: 'List Oracle discussion threads. Filter by status to find pending questions or active discussions.',
          inputSchema: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['active', 'answered', 'pending', 'closed'], description: 'Filter by thread status' },
              limit: { type: 'number', description: 'Maximum threads to return (default: 20)', default: 20 },
              offset: { type: 'number', description: 'Pagination offset', default: 0 },
            },
            required: []
          }
        },
        {
          name: 'oracle_thread_read',
          description: 'Read full message history from a thread. Use to review context before continuing a conversation.',
          inputSchema: {
            type: 'object',
            properties: {
              threadId: { type: 'number', description: 'Thread ID to read' },
              limit: { type: 'number', description: 'Maximum messages to return (default: all)' },
            },
            required: ['threadId']
          }
        },
        {
          name: 'oracle_thread_update',
          description: 'Update thread status. Use to close, reopen, or mark threads as answered/pending.',
          inputSchema: {
            type: 'object',
            properties: {
              threadId: { type: 'number', description: 'Thread ID to update' },
              status: { type: 'string', enum: ['active', 'closed', 'answered', 'pending'], description: 'New status for the thread' },
            },
            required: ['threadId', 'status']
          }
        },
        // Trace tools
        {
          name: 'oracle_trace',
          description: 'Log a trace session with dig points (files, commits, issues found). Use to capture /trace command results for future exploration.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'What was traced (required)' },
              queryType: { type: 'string', enum: ['general', 'project', 'pattern', 'evolution'], description: 'Type of trace query', default: 'general' },
              foundFiles: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, type: { type: 'string', enum: ['learning', 'retro', 'resonance', 'other'] }, matchReason: { type: 'string' }, confidence: { type: 'string', enum: ['high', 'medium', 'low'] } } }, description: 'Files discovered' },
              foundCommits: { type: 'array', items: { type: 'object', properties: { hash: { type: 'string' }, shortHash: { type: 'string' }, date: { type: 'string' }, message: { type: 'string' } } }, description: 'Commits discovered' },
              foundIssues: { type: 'array', items: { type: 'object', properties: { number: { type: 'number' }, title: { type: 'string' }, state: { type: 'string', enum: ['open', 'closed'] }, url: { type: 'string' } } }, description: 'GitHub issues discovered' },
              foundRetrospectives: { type: 'array', items: { type: 'string' }, description: 'Retrospective file paths' },
              foundLearnings: { type: 'array', items: { type: 'string' }, description: 'Learning file paths' },
              parentTraceId: { type: 'string', description: 'Parent trace ID if this is a dig from another trace' },
              project: { type: 'string', description: 'Project context (ghq format)' },
              agentCount: { type: 'number', description: 'Number of agents used in trace' },
              durationMs: { type: 'number', description: 'How long trace took in milliseconds' },
            },
            required: ['query']
          }
        },
        {
          name: 'oracle_trace_list',
          description: 'List recent traces with optional filters. Returns trace summaries for browsing.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Filter by query content' },
              project: { type: 'string', description: 'Filter by project' },
              status: { type: 'string', enum: ['raw', 'reviewed', 'distilling', 'distilled'], description: 'Filter by distillation status' },
              depth: { type: 'number', description: 'Filter by recursion depth (0 = top-level traces)' },
              limit: { type: 'number', description: 'Maximum traces to return', default: 20 },
              offset: { type: 'number', description: 'Pagination offset', default: 0 },
            }
          }
        },
        {
          name: 'oracle_trace_get',
          description: 'Get full details of a specific trace including all dig points (files, commits, issues).',
          inputSchema: {
            type: 'object',
            properties: {
              traceId: { type: 'string', description: 'UUID of the trace' },
              includeChain: { type: 'boolean', description: 'Include parent/child trace chain', default: false },
            },
            required: ['traceId']
          }
        },
        {
          name: 'oracle_trace_link',
          description: 'Link two traces as a chain (prev → next). Creates bidirectional navigation without deleting anything. Use when agents create related traces that should be connected.',
          inputSchema: {
            type: 'object',
            properties: {
              prevTraceId: { type: 'string', description: 'UUID of the trace that comes first (will link forward)' },
              nextTraceId: { type: 'string', description: 'UUID of the trace that comes after (will link backward)' },
            },
            required: ['prevTraceId', 'nextTraceId']
          }
        },
        {
          name: 'oracle_trace_unlink',
          description: 'Remove a link between traces. Breaks the chain connection in the specified direction.',
          inputSchema: {
            type: 'object',
            properties: {
              traceId: { type: 'string', description: 'UUID of the trace to unlink from' },
              direction: { type: 'string', enum: ['prev', 'next'], description: 'Which direction to unlink (prev or next)' },
            },
            required: ['traceId', 'direction']
          }
        },
        {
          name: 'oracle_trace_chain',
          description: 'Get the full linked chain for a trace. Returns all traces in the chain and the position of the requested trace.',
          inputSchema: {
            type: 'object',
            properties: {
              traceId: { type: 'string', description: 'UUID of any trace in the chain' },
            },
            required: ['traceId']
          }
        },
        // Supersede, Handoff, Inbox, Verify
        supersedeToolDef,
        handoffToolDef,
        inboxToolDef,
        verifyToolDef,
      ];

      const tools = this.readOnly
        ? allTools.filter(t => !WRITE_TOOLS.includes(t.name))
        : allTools;

      return { tools };
    });

    // ================================================================
    // Handle tool calls — route to extracted handlers
    // ================================================================
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (this.readOnly && WRITE_TOOLS.includes(request.params.name)) {
        return {
          content: [{
            type: 'text',
            text: `Error: Tool "${request.params.name}" is disabled in read-only mode. This Oracle instance is configured for read-only access.`
          }],
          isError: true
        };
      }

      const ctx = this.toolCtx;

      try {
        switch (request.params.name) {
          // Core tools (delegated to src/tools/)
          case 'oracle_search':
            return await handleSearch(ctx, request.params.arguments as unknown as OracleSearchInput);
          case 'oracle_reflect':
            return await handleReflect(ctx, request.params.arguments as unknown as OracleReflectInput);
          case 'oracle_learn':
            return await handleLearn(ctx, request.params.arguments as unknown as OracleLearnInput);
          case 'oracle_list':
            return await handleList(ctx, request.params.arguments as unknown as OracleListInput);
          case 'oracle_stats':
            return await handleStats(ctx, request.params.arguments as unknown as OracleStatsInput);
          case 'oracle_concepts':
            return await handleConcepts(ctx, request.params.arguments as unknown as OracleConceptsInput);
          case 'oracle_supersede':
            return await handleSupersede(ctx, request.params.arguments as unknown as OracleSupersededInput);
          case 'oracle_handoff':
            return await handleHandoff(ctx, request.params.arguments as unknown as OracleHandoffInput);
          case 'oracle_inbox':
            return await handleInbox(ctx, request.params.arguments as unknown as OracleInboxInput);
          case 'oracle_verify':
            return await handleVerify(ctx, request.params.arguments as unknown as OracleVerifyInput);

          // Forum tools (delegated to forum/handler.ts)
          case 'oracle_thread':
            return await this.handleThread(request.params.arguments as unknown as OracleThreadInput);
          case 'oracle_threads':
            return await this.handleThreads(request.params.arguments as unknown as OracleThreadsInput);
          case 'oracle_thread_read':
            return await this.handleThreadRead(request.params.arguments as unknown as OracleThreadReadInput);
          case 'oracle_thread_update':
            return await this.handleThreadUpdate(request.params.arguments as unknown as OracleThreadUpdateInput);

          // Trace tools (delegated to trace/handler.ts)
          case 'oracle_trace':
            return await this.handleTrace(request.params.arguments as unknown as CreateTraceInput);
          case 'oracle_trace_list':
            return await this.handleTraceList(request.params.arguments as unknown as ListTracesInput);
          case 'oracle_trace_get':
            return await this.handleTraceGet(request.params.arguments as unknown as GetTraceInput);
          case 'oracle_trace_link':
            return await this.handleTraceLink(request.params.arguments as unknown as { prevTraceId: string; nextTraceId: string });
          case 'oracle_trace_unlink':
            return await this.handleTraceUnlink(request.params.arguments as unknown as { traceId: string; direction: 'prev' | 'next' });
          case 'oracle_trace_chain':
            return await this.handleTraceChain(request.params.arguments as unknown as { traceId: string });

          default:
            throw new Error(`Unknown tool: ${request.params.name}`);
        }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    });
  }

  // ================================================================
  // Forum handlers (thin wrappers — already delegated)
  // ================================================================

  private async handleThread(input: OracleThreadInput) {
    const result = await handleThreadMessage({
      message: input.message,
      threadId: input.threadId,
      title: input.title,
      role: input.role || 'claude',
      model: input.model,
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          thread_id: result.threadId,
          message_id: result.messageId,
          status: result.status,
          oracle_response: result.oracleResponse ? {
            content: result.oracleResponse.content,
            principles_found: result.oracleResponse.principlesFound,
            patterns_found: result.oracleResponse.patternsFound,
          } : null,
          issue_url: result.issueUrl,
        }, null, 2)
      }]
    };
  }

  private async handleThreads(input: OracleThreadsInput) {
    const result = listThreads({
      status: input.status as any,
      limit: input.limit || 20,
      offset: input.offset || 0,
    });

    const threadsWithCounts = result.threads.map(thread => {
      const messages = getMessages(thread.id);
      const lastMessage = messages[messages.length - 1];
      return {
        id: thread.id,
        title: thread.title,
        status: thread.status,
        message_count: messages.length,
        last_message: lastMessage?.content.substring(0, 100) || '',
        created_at: new Date(thread.createdAt).toISOString(),
        issue_url: thread.issueUrl,
      };
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ threads: threadsWithCounts, total: result.total }, null, 2)
      }]
    };
  }

  private async handleThreadRead(input: OracleThreadReadInput) {
    const threadData = getFullThread(input.threadId);
    if (!threadData) throw new Error(`Thread ${input.threadId} not found`);

    let messages = threadData.messages.map(m => ({
      id: m.id,
      role: m.role,
      author: m.author,
      content: m.content,
      timestamp: new Date(m.createdAt).toISOString(),
    }));

    if (input.limit && input.limit > 0) {
      messages = messages.slice(-input.limit);
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          thread_id: threadData.thread.id,
          title: threadData.thread.title,
          status: threadData.thread.status,
          message_count: threadData.messages.length,
          messages,
        }, null, 2)
      }]
    };
  }

  private async handleThreadUpdate(input: OracleThreadUpdateInput) {
    if (!input.status) throw new Error('status is required');

    updateThreadStatus(input.threadId, input.status);
    const threadData = getFullThread(input.threadId);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          thread_id: input.threadId,
          status: input.status,
          title: threadData?.thread.title,
        }, null, 2)
      }]
    };
  }

  // ================================================================
  // Trace handlers (thin wrappers — already delegated)
  // ================================================================

  private async handleTrace(input: CreateTraceInput) {
    const result = createTrace(input);
    console.error(`[MCP:TRACE] query="${input.query}" depth=${result.depth} digPoints=${result.summary.totalDigPoints}`);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: result.success,
          trace_id: result.traceId,
          depth: result.depth,
          summary: {
            file_count: result.summary.fileCount,
            commit_count: result.summary.commitCount,
            issue_count: result.summary.issueCount,
            total_dig_points: result.summary.totalDigPoints,
          },
          message: `Trace logged. Use oracle_trace_get with trace_id="${result.traceId}" to explore dig points.`
        }, null, 2)
      }]
    };
  }

  private async handleTraceList(input: ListTracesInput) {
    const result = listTraces(input);
    console.error(`[MCP:TRACE_LIST] found=${result.total} returned=${result.traces.length}`);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          traces: result.traces.map(t => ({
            trace_id: t.traceId,
            query: t.query,
            depth: t.depth,
            file_count: t.fileCount,
            commit_count: t.commitCount,
            issue_count: t.issueCount,
            status: t.status,
            has_awakening: t.hasAwakening,
            created_at: new Date(t.createdAt).toISOString(),
          })),
          total: result.total,
          has_more: result.hasMore,
        }, null, 2)
      }]
    };
  }

  private async handleTraceGet(input: GetTraceInput) {
    const trace = getTrace(input.traceId);
    if (!trace) throw new Error(`Trace ${input.traceId} not found`);

    console.error(`[MCP:TRACE_GET] id=${input.traceId} query="${trace.query}"`);

    let chain = undefined;
    if (input.includeChain) {
      chain = getTraceChain(input.traceId);
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          trace_id: trace.traceId,
          query: trace.query,
          query_type: trace.queryType,
          depth: trace.depth,
          status: trace.status,
          found_files: trace.foundFiles,
          found_commits: trace.foundCommits,
          found_issues: trace.foundIssues,
          found_retrospectives: trace.foundRetrospectives,
          found_learnings: trace.foundLearnings,
          found_resonance: trace.foundResonance,
          file_count: trace.fileCount,
          commit_count: trace.commitCount,
          issue_count: trace.issueCount,
          parent_trace_id: trace.parentTraceId,
          child_trace_ids: trace.childTraceIds,
          prev_trace_id: trace.prevTraceId,
          next_trace_id: trace.nextTraceId,
          project: trace.project,
          agent_count: trace.agentCount,
          duration_ms: trace.durationMs,
          awakening: trace.awakening,
          distilled_to_id: trace.distilledToId,
          created_at: new Date(trace.createdAt).toISOString(),
          updated_at: new Date(trace.updatedAt).toISOString(),
          chain: chain ? {
            traces: chain.chain,
            total_depth: chain.totalDepth,
            has_awakening: chain.hasAwakening,
            awakening_trace_id: chain.awakeningTraceId,
          } : undefined,
        }, null, 2)
      }]
    };
  }

  private async handleTraceLink(input: { prevTraceId: string; nextTraceId: string }) {
    const result = linkTraces(input.prevTraceId, input.nextTraceId);
    if (!result.success) throw new Error(result.message);

    console.error(`[MCP:TRACE_LINK] ${input.prevTraceId} → ${input.nextTraceId}`);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          message: result.message,
          prev_trace: result.prevTrace ? {
            trace_id: result.prevTrace.traceId,
            query: result.prevTrace.query,
            next_trace_id: result.prevTrace.nextTraceId,
          } : undefined,
          next_trace: result.nextTrace ? {
            trace_id: result.nextTrace.traceId,
            query: result.nextTrace.query,
            prev_trace_id: result.nextTrace.prevTraceId,
          } : undefined,
        }, null, 2)
      }]
    };
  }

  private async handleTraceUnlink(input: { traceId: string; direction: 'prev' | 'next' }) {
    const result = unlinkTraces(input.traceId, input.direction);
    if (!result.success) throw new Error(result.message);

    console.error(`[MCP:TRACE_UNLINK] ${input.traceId} direction=${input.direction}`);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ success: true, message: result.message }, null, 2)
      }]
    };
  }

  private async handleTraceChain(input: { traceId: string }) {
    const result = getTraceLinkedChain(input.traceId);
    console.error(`[MCP:TRACE_CHAIN] id=${input.traceId} chain_length=${result.chain.length} position=${result.position}`);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          chain: result.chain.map(t => ({
            trace_id: t.traceId,
            query: t.query,
            prev_trace_id: t.prevTraceId,
            next_trace_id: t.nextTraceId,
            created_at: new Date(t.createdAt).toISOString(),
          })),
          position: result.position,
          chain_length: result.chain.length,
        }, null, 2)
      }]
    };
  }

  async preConnectChroma(): Promise<void> {
    await this.chromaMcp.connect();
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Oracle Nightly MCP Server running on stdio (FTS5 mode)');
  }
}

async function main() {
  const readOnly = process.env.ORACLE_READ_ONLY === 'true' || process.argv.includes('--read-only');
  const server = new OracleMCPServer({ readOnly });

  try {
    console.error('[Startup] Pre-connecting to chroma-mcp...');
    await server.preConnectChroma();
    console.error('[Startup] Chroma pre-connected successfully');
  } catch (e) {
    console.error('[Startup] Chroma pre-connect failed:', e instanceof Error ? e.message : e);
  }

  try {
    console.error('[Startup] Ensuring HTTP server is running...');
    await ensureServerRunning({ timeout: 5000 });
    console.error('[Startup] HTTP server ready');
  } catch (e) {
    console.error('[Startup] HTTP server auto-start failed:', e instanceof Error ? e.message : e);
  }

  await server.run();
}

main().catch(console.error);
