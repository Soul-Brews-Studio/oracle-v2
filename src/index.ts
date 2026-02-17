/**
 * Oracle Nightly MCP Server (MVP - FTS5 only)
 *
 * Provides keyword search and consultation over Oracle knowledge base.
 * MVP version using SQLite FTS5 only (no ChromaDB).
 *
 * Tools:
 * 1. oracle_search - Search Oracle knowledge using keywords
 * 2. oracle_consult - Get guidance based on principles
 * 3. oracle_reflect - Random wisdom for reflection
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { Database } from 'bun:sqlite';
import { drizzle, BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { eq, sql, and, ne, isNotNull, inArray } from 'drizzle-orm';
import * as schema from './db/schema.js';
import { oracleDocuments, consultLog } from './db/schema.js';
import { ChromaMcpClient } from './chroma-mcp.js';
import path from 'path';
import fs from 'fs';
import {
  handleThreadMessage,
  listThreads,
  getFullThread,
  getMessages,
  updateThreadStatus,
} from './forum/handler.js';
import { detectProject } from './server/project-detect.js';

import {
  createDecision,
  getDecision,
  updateDecision,
  listDecisions,
  transitionStatus,
  getDecisionCounts,
} from './decisions/handler.js';

import type {
  DecisionStatus,
  CreateDecisionInput,
  UpdateDecisionInput,
  ListDecisionsInput,
} from './decisions/types.js';

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

import { logSearch } from './server/logging.js';
import { ensureServerRunning } from './ensure-server.js';

interface OracleSearchInput {
  query: string;
  type?: 'principle' | 'pattern' | 'learning' | 'retro' | 'all';
  limit?: number;
  offset?: number;
  mode?: 'hybrid' | 'fts' | 'vector';
}

interface OracleConsultInput {
  decision: string;
  context?: string;
}

interface OracleReflectInput {}

interface OracleLearnInput {
  pattern: string;
  source?: string;
  concepts?: string[];
  project?: string;
}

interface OracleListInput {
  type?: 'principle' | 'pattern' | 'learning' | 'retro' | 'all';
  limit?: number;
  offset?: number;
}

interface OracleMetadata {
  id: string;
  type: string;
  source_file: string;
  concepts: string;
}

interface OracleStatsInput {}

interface OracleConceptsInput {
  limit?: number;
  type?: 'principle' | 'pattern' | 'learning' | 'retro' | 'all';
}

interface OracleThreadInput {
  message: string;
  threadId?: number;
  title?: string;
  role?: 'human' | 'claude';
  model?: string;  // e.g., 'opus', 'sonnet'
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

// Decision tracking interfaces
interface OracleDecisionsListInput {
  status?: DecisionStatus;
  project?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
}

interface OracleDecisionsCreateInput {
  title: string;
  context?: string;
  options?: Array<{ label: string; pros: string[]; cons: string[] }>;
  tags?: string[];
  project?: string;
}

interface OracleDecisionsGetInput {
  id: number;
}

interface OracleDecisionsUpdateInput {
  id: number;
  title?: string;
  context?: string;
  options?: Array<{ label: string; pros: string[]; cons: string[] }>;
  decision?: string;
  rationale?: string;
  tags?: string[];
  status?: DecisionStatus;
  decidedBy?: string;
}

// Issue #19: Supersede pattern
interface OracleSupersededInput {
  oldId: string;
  newId: string;
  reason?: string;
}

// Write tools that should be disabled in read-only mode
const WRITE_TOOLS = [
  'oracle_learn',
  'oracle_thread',
  'oracle_thread_update',
  'oracle_decisions_create',
  'oracle_decisions_update',
  'oracle_trace',
  'oracle_supersede',
];

class OracleMCPServer {
  private server: Server;
  private sqlite: Database;  // Raw bun:sqlite for FTS operations
  private db: BunSQLiteDatabase<typeof schema>;  // Drizzle for type-safe queries
  private repoRoot: string;
  private chromaMcp: ChromaMcpClient;
  private chromaStatus: 'unknown' | 'connected' | 'unavailable' = 'unknown';
  private readOnly: boolean;

  constructor(options: { readOnly?: boolean } = {}) {
    this.readOnly = options.readOnly ?? false;
    if (this.readOnly) {
      console.error('[Oracle] Running in READ-ONLY mode');
    }
    this.repoRoot = process.env.ORACLE_REPO_ROOT || process.cwd();

    // Common paths
    const homeDir = process.env.HOME || process.env.USERPROFILE || '/tmp';

    // Initialize ChromaMcpClient (uses same uvx/chroma-mcp as indexer)
    const chromaPath = path.join(homeDir, '.chromadb');
    this.chromaMcp = new ChromaMcpClient('oracle_knowledge', chromaPath, '3.12');

    this.server = new Server(
      {
        name: 'oracle-nightly',
        version: '0.2.1',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize SQLite database (central location: ~/.oracle-v2/)
    const oracleDataDir = process.env.ORACLE_DATA_DIR || path.join(homeDir, '.oracle-v2');
    const dbPath = process.env.ORACLE_DB_PATH || path.join(oracleDataDir, 'oracle.db');
    this.sqlite = new Database(dbPath);  // Raw connection for FTS operations
    this.db = drizzle(this.sqlite, { schema });  // Drizzle wrapper for type-safe queries

    this.setupHandlers();
    this.setupErrorHandling();

    // Check ChromaDB health on startup (non-blocking)
    this.verifyChromaHealth();
  }

  /**
   * Verify ChromaDB connection health via chroma-mcp
   * Non-blocking - logs status and sets chromaStatus flag
   */
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

  /**
   * Setup MCP handlers
   */
  private setupHandlers(): void {
    // List available tools (filtered in read-only mode)
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const allTools = [
        // Meta-documentation tool (not callable, just instructions)
        {
          name: '____IMPORTANT',
          description: `ORACLE WORKFLOW GUIDE:

1. SEARCH & DISCOVER
   oracle_search(query) → Find knowledge by keywords/vectors
   oracle_list() → Browse all documents
   oracle_concepts() → See topic coverage

2. CONSULT & REFLECT
   oracle_consult(decision) → Get guidance for decisions
   oracle_reflect() → Random wisdom for alignment

3. LEARN & REMEMBER
   oracle_learn(pattern) → Add new patterns/learnings
   oracle_thread(message) → Multi-turn discussions
   ⚠️ BEFORE adding: search for similar topics first!
   If updating old info → use oracle_supersede(oldId, newId)

4. TRACE & DISTILL
   oracle_trace(query) → Log discovery sessions with dig points
   oracle_trace_list() → Find past traces
   oracle_trace_get(id) → Explore dig points (files, commits, issues)
   oracle_trace_link(prevId, nextId) → Chain related traces together
   oracle_trace_chain(id) → View the full linked chain

5. DECIDE & TRACK
   oracle_decisions_create() → Track important decisions
   oracle_decisions_list() → Review pending decisions

6. SUPERSEDE (when info changes)
   oracle_supersede(oldId, newId, reason) → Mark old doc as outdated
   "Nothing is Deleted" — old preserved, just marked superseded

Philosophy: "Nothing is Deleted" — All interactions logged.`,
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'oracle_search',
          description: 'Search Oracle knowledge base using hybrid search (FTS5 keywords + ChromaDB vectors). Finds relevant principles, patterns, learnings, or retrospectives. Falls back to FTS5-only if ChromaDB unavailable.',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query (e.g., "nothing deleted", "force push safety")'
              },
              type: {
                type: 'string',
                enum: ['principle', 'pattern', 'learning', 'retro', 'all'],
                description: 'Filter by document type',
                default: 'all'
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results',
                default: 5
              },
              offset: {
                type: 'number',
                description: 'Number of results to skip (for pagination)',
                default: 0
              },
              mode: {
                type: 'string',
                enum: ['hybrid', 'fts', 'vector'],
                description: 'Search mode: hybrid (default), fts (keywords only), vector (semantic only)',
                default: 'hybrid'
              }
            },
            required: ['query']
          }
        },
        {
          name: 'oracle_consult',
          description: 'Get guidance on a decision based on Oracle philosophy. Returns relevant principles and patterns with synthesized guidance.',
          inputSchema: {
            type: 'object',
            properties: {
              decision: {
                type: 'string',
                description: 'The decision you need to make'
              },
              context: {
                type: 'string',
                description: 'Additional context about your current situation'
              }
            },
            required: ['decision']
          }
        },
        {
          name: 'oracle_reflect',
          description: 'Get a random principle or learning for reflection. Use this for periodic wisdom or to align with Oracle philosophy.',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
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
        },
        {
          name: 'oracle_list',
          description: 'List all documents in Oracle knowledge base. Browse without searching - useful for exploring what knowledge exists. Supports pagination and type filtering.',
          inputSchema: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['principle', 'pattern', 'learning', 'retro', 'all'],
                description: 'Filter by document type',
                default: 'all'
              },
              limit: {
                type: 'number',
                description: 'Maximum number of documents to return (1-100)',
                default: 10
              },
              offset: {
                type: 'number',
                description: 'Number of documents to skip (for pagination)',
                default: 0
              }
            },
            required: []
          }
        },
        {
          name: 'oracle_stats',
          description: 'Get Oracle knowledge base statistics and health status. Returns document counts by type, indexing status, and ChromaDB connection status.',
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          }
        },
        {
          name: 'oracle_concepts',
          description: 'List all concept tags in the Oracle knowledge base with document counts. Useful for discovering what topics are covered and filtering searches.',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: 'Maximum number of concepts to return (default: 50)',
                default: 50
              },
              type: {
                type: 'string',
                enum: ['principle', 'pattern', 'learning', 'retro', 'all'],
                description: 'Filter concepts by document type',
                default: 'all'
              }
            },
            required: []
          }
        },
        {
          name: 'oracle_thread',
          description: 'Send a message to an Oracle discussion thread. Creates a new thread or continues an existing one. Oracle auto-responds from knowledge base. Use for multi-turn consultations.',
          inputSchema: {
            type: 'object',
            properties: {
              message: {
                type: 'string',
                description: 'Your question or message'
              },
              threadId: {
                type: 'number',
                description: 'Thread ID to continue (omit to create new thread)'
              },
              title: {
                type: 'string',
                description: 'Title for new thread (defaults to first 50 chars of message)'
              },
              role: {
                type: 'string',
                enum: ['human', 'claude'],
                description: 'Who is sending (default: human)',
                default: 'human'
              },
              model: {
                type: 'string',
                description: 'Model name for Claude calls (e.g., "opus", "sonnet")'
              }
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
              status: {
                type: 'string',
                enum: ['active', 'answered', 'pending', 'closed'],
                description: 'Filter by thread status'
              },
              limit: {
                type: 'number',
                description: 'Maximum threads to return (default: 20)',
                default: 20
              },
              offset: {
                type: 'number',
                description: 'Pagination offset',
                default: 0
              }
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
              threadId: {
                type: 'number',
                description: 'Thread ID to read'
              },
              limit: {
                type: 'number',
                description: 'Maximum messages to return (default: all)',
              }
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
              threadId: {
                type: 'number',
                description: 'Thread ID to update'
              },
              status: {
                type: 'string',
                enum: ['active', 'closed', 'answered', 'pending'],
                description: 'New status for the thread'
              }
            },
            required: ['threadId', 'status']
          }
        },
        // Decision tracking tools
        {
          name: 'oracle_decisions_list',
          description: 'List decisions with optional filters. Returns decisions with status counts for dashboard view.',
          inputSchema: {
            type: 'object',
            properties: {
              status: {
                type: 'string',
                enum: ['pending', 'parked', 'researching', 'decided', 'implemented', 'closed'],
                description: 'Filter by decision status'
              },
              project: {
                type: 'string',
                description: 'Filter by project (ghq path)'
              },
              tags: {
                type: 'array',
                items: { type: 'string' },
                description: 'Filter by tags (matches any)'
              },
              limit: {
                type: 'number',
                description: 'Maximum decisions to return (default: 20)',
                default: 20
              },
              offset: {
                type: 'number',
                description: 'Pagination offset',
                default: 0
              }
            },
            required: []
          }
        },
        {
          name: 'oracle_decisions_create',
          description: 'Create a new decision to track. Starts in "pending" status.',
          inputSchema: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'Decision title (e.g., "Multiple psi directory architecture")'
              },
              context: {
                type: 'string',
                description: 'Why this decision matters, background information'
              },
              options: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    label: { type: 'string', description: 'Option name' },
                    pros: { type: 'array', items: { type: 'string' }, description: 'Advantages' },
                    cons: { type: 'array', items: { type: 'string' }, description: 'Disadvantages' }
                  },
                  required: ['label', 'pros', 'cons']
                },
                description: 'Available options with pros/cons'
              },
              tags: {
                type: 'array',
                items: { type: 'string' },
                description: 'Tags for categorization (e.g., ["architecture", "urgent"])'
              },
              project: {
                type: 'string',
                description: 'Project context (auto-detected if not provided)'
              }
            },
            required: ['title']
          }
        },
        {
          name: 'oracle_decisions_get',
          description: 'Get a single decision with full details including options, decision, and rationale.',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'number',
                description: 'Decision ID'
              }
            },
            required: ['id']
          }
        },
        {
          name: 'oracle_decisions_update',
          description: 'Update a decision. Use to add decision/rationale, change status, or modify details. Status transitions are validated.',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'number',
                description: 'Decision ID to update'
              },
              title: {
                type: 'string',
                description: 'Updated title'
              },
              context: {
                type: 'string',
                description: 'Updated context'
              },
              options: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    label: { type: 'string' },
                    pros: { type: 'array', items: { type: 'string' } },
                    cons: { type: 'array', items: { type: 'string' } }
                  }
                },
                description: 'Updated options'
              },
              decision: {
                type: 'string',
                description: 'The decision made (what was chosen)'
              },
              rationale: {
                type: 'string',
                description: 'Why this choice was made'
              },
              tags: {
                type: 'array',
                items: { type: 'string' },
                description: 'Updated tags'
              },
              status: {
                type: 'string',
                enum: ['pending', 'parked', 'researching', 'decided', 'implemented', 'closed'],
                description: 'New status (must be valid transition)'
              },
              decidedBy: {
                type: 'string',
                description: 'Who made the decision (e.g., "user", "opus")'
              }
            },
            required: ['id']
          }
        },
        // ============================================================================
        // Trace Log Tools (Issue #17)
        // ============================================================================
        {
          name: 'oracle_trace',
          description: 'Log a trace session with dig points (files, commits, issues found). Use to capture /trace command results for future exploration.',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'What was traced (required)'
              },
              queryType: {
                type: 'string',
                enum: ['general', 'project', 'pattern', 'evolution'],
                description: 'Type of trace query',
                default: 'general'
              },
              foundFiles: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    path: { type: 'string' },
                    type: { type: 'string', enum: ['learning', 'retro', 'resonance', 'other'] },
                    matchReason: { type: 'string' },
                    confidence: { type: 'string', enum: ['high', 'medium', 'low'] }
                  }
                },
                description: 'Files discovered'
              },
              foundCommits: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    hash: { type: 'string' },
                    shortHash: { type: 'string' },
                    date: { type: 'string' },
                    message: { type: 'string' }
                  }
                },
                description: 'Commits discovered'
              },
              foundIssues: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    number: { type: 'number' },
                    title: { type: 'string' },
                    state: { type: 'string', enum: ['open', 'closed'] },
                    url: { type: 'string' }
                  }
                },
                description: 'GitHub issues discovered'
              },
              foundRetrospectives: {
                type: 'array',
                items: { type: 'string' },
                description: 'Retrospective file paths'
              },
              foundLearnings: {
                type: 'array',
                items: { type: 'string' },
                description: 'Learning file paths'
              },
              parentTraceId: {
                type: 'string',
                description: 'Parent trace ID if this is a dig from another trace'
              },
              project: {
                type: 'string',
                description: 'Project context (ghq format)'
              },
              agentCount: {
                type: 'number',
                description: 'Number of agents used in trace'
              },
              durationMs: {
                type: 'number',
                description: 'How long trace took in milliseconds'
              }
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
              query: {
                type: 'string',
                description: 'Filter by query content'
              },
              project: {
                type: 'string',
                description: 'Filter by project'
              },
              status: {
                type: 'string',
                enum: ['raw', 'reviewed', 'distilling', 'distilled'],
                description: 'Filter by distillation status'
              },
              depth: {
                type: 'number',
                description: 'Filter by recursion depth (0 = top-level traces)'
              },
              limit: {
                type: 'number',
                description: 'Maximum traces to return',
                default: 20
              },
              offset: {
                type: 'number',
                description: 'Pagination offset',
                default: 0
              }
            }
          }
        },
        {
          name: 'oracle_trace_get',
          description: 'Get full details of a specific trace including all dig points (files, commits, issues).',
          inputSchema: {
            type: 'object',
            properties: {
              traceId: {
                type: 'string',
                description: 'UUID of the trace'
              },
              includeChain: {
                type: 'boolean',
                description: 'Include parent/child trace chain',
                default: false
              }
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
              prevTraceId: {
                type: 'string',
                description: 'UUID of the trace that comes first (will link forward)'
              },
              nextTraceId: {
                type: 'string',
                description: 'UUID of the trace that comes after (will link backward)'
              }
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
              traceId: {
                type: 'string',
                description: 'UUID of the trace to unlink from'
              },
              direction: {
                type: 'string',
                enum: ['prev', 'next'],
                description: 'Which direction to unlink (prev or next)'
              }
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
              traceId: {
                type: 'string',
                description: 'UUID of any trace in the chain'
              }
            },
            required: ['traceId']
          }
        },
        // ============================================================================
        // Supersede Tool (Issue #19) - "Nothing is Deleted" but can be outdated
        // ============================================================================
        {
          name: 'oracle_supersede',
          description: 'Mark an old learning/document as superseded by a newer one. Aligns with "Nothing is Deleted" - old doc preserved but marked outdated.',
          inputSchema: {
            type: 'object',
            properties: {
              oldId: {
                type: 'string',
                description: 'ID of the document being superseded (the outdated one)'
              },
              newId: {
                type: 'string',
                description: 'ID of the document that supersedes it (the current one)'
              },
              reason: {
                type: 'string',
                description: 'Why the old document is outdated (optional)'
              }
            },
            required: ['oldId', 'newId']
          }
        }
      ];

      // Filter out write tools in read-only mode
      const tools = this.readOnly
        ? allTools.filter(t => !WRITE_TOOLS.includes(t.name))
        : allTools;

      return { tools };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      // Block write tools in read-only mode
      if (this.readOnly && WRITE_TOOLS.includes(request.params.name)) {
        return {
          content: [{
            type: 'text',
            text: `Error: Tool "${request.params.name}" is disabled in read-only mode. This Oracle instance is configured for read-only access.`
          }],
          isError: true
        };
      }

      try {
        switch (request.params.name) {
          case 'oracle_search':
            return await this.handleSearch(request.params.arguments as unknown as OracleSearchInput);

          case 'oracle_consult':
            return await this.handleConsult(request.params.arguments as unknown as OracleConsultInput);

          case 'oracle_reflect':
            return await this.handleReflect(request.params.arguments as unknown as OracleReflectInput);

          case 'oracle_learn':
            return await this.handleLearn(request.params.arguments as unknown as OracleLearnInput);

          case 'oracle_list':
            return await this.handleList(request.params.arguments as unknown as OracleListInput);

          case 'oracle_stats':
            return await this.handleStats(request.params.arguments as unknown as OracleStatsInput);

          case 'oracle_concepts':
            return await this.handleConcepts(request.params.arguments as unknown as OracleConceptsInput);

          case 'oracle_thread':
            return await this.handleThread(request.params.arguments as unknown as OracleThreadInput);

          case 'oracle_threads':
            return await this.handleThreads(request.params.arguments as unknown as OracleThreadsInput);

          case 'oracle_thread_read':
            return await this.handleThreadRead(request.params.arguments as unknown as OracleThreadReadInput);

          case 'oracle_thread_update':
            return await this.handleThreadUpdate(request.params.arguments as unknown as OracleThreadUpdateInput);

          // Decision tracking handlers
          case 'oracle_decisions_list':
            return await this.handleDecisionsList(request.params.arguments as unknown as OracleDecisionsListInput);

          case 'oracle_decisions_create':
            return await this.handleDecisionsCreate(request.params.arguments as unknown as OracleDecisionsCreateInput);

          case 'oracle_decisions_get':
            return await this.handleDecisionsGet(request.params.arguments as unknown as OracleDecisionsGetInput);

          case 'oracle_decisions_update':
            return await this.handleDecisionsUpdate(request.params.arguments as unknown as OracleDecisionsUpdateInput);

          // Trace log handlers (Issue #17)
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

          // Supersede handler (Issue #19)
          case 'oracle_supersede':
            return await this.handleSupersede(request.params.arguments as unknown as OracleSupersededInput);

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

  /**
   * Private: Sanitize FTS5 query to prevent parse errors
   * Removes/escapes FTS5 special characters
   */
  private sanitizeFtsQuery(query: string): string {
    // Remove FTS5 special characters that could cause parse errors
    // Includes: ? * + - ( ) ^ ~ " ' : . / (all can cause FTS5 syntax errors)
    let sanitized = query
      .replace(/[?*+\-()^~"':.\/]/g, ' ')  // Remove FTS5 operators (incl /)
      .replace(/\s+/g, ' ')               // Normalize whitespace
      .trim();

    // If result is empty after sanitization, return original
    // (will cause FTS5 error, but better than silent empty result)
    if (!sanitized) {
      console.error('[FTS5] Query became empty after sanitization:', query);
      return query;
    }

    return sanitized;
  }

  /**
   * Tool: oracle_search
   * Hybrid search combining FTS5 keyword search and vector semantic search
   * Gracefully falls back to FTS5-only if ChromaDB is unavailable
   */
  private async handleSearch(input: OracleSearchInput) {
    const startTime = Date.now();
    const { query, type = 'all', limit = 5, offset = 0, mode = 'hybrid' } = input;

    // Validate query
    if (!query || query.trim().length === 0) {
      throw new Error('Query cannot be empty');
    }

    // Build FTS query - sanitize special characters
    const safeQuery = this.sanitizeFtsQuery(query);

    // Track warnings for fallback scenarios
    let warning: string | undefined;
    let vectorSearchError = false;

    // Run FTS5 search (skip if vector-only mode)
    let ftsRawResults: any[] = [];
    if (mode !== 'vector') {
      if (type === 'all') {
        const stmt = this.sqlite.prepare(`
          SELECT f.id, f.content, d.type, d.source_file, d.concepts, rank
          FROM oracle_fts f
          JOIN oracle_documents d ON f.id = d.id
          WHERE oracle_fts MATCH ?
          ORDER BY rank
          LIMIT ?
        `);
        ftsRawResults = stmt.all(safeQuery, limit * 2);
      } else {
        const stmt = this.sqlite.prepare(`
          SELECT f.id, f.content, d.type, d.source_file, d.concepts, rank
          FROM oracle_fts f
          JOIN oracle_documents d ON f.id = d.id
          WHERE oracle_fts MATCH ? AND d.type = ?
          ORDER BY rank
          LIMIT ?
        `);
        ftsRawResults = stmt.all(safeQuery, type, limit * 2);
      }
    }

    // Run vector search (skip if fts-only mode)
    let vectorResults: Awaited<ReturnType<typeof this.vectorSearch>> = [];
    if (mode !== 'fts') {
      try {
        vectorResults = await this.vectorSearch(query, type, limit * 2);
      } catch (error) {
        vectorSearchError = true;
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('[ChromaDB]', errorMessage);
        warning = `Vector search unavailable: ${errorMessage}. Using FTS5 only.`;
      }

      // Check if vectorSearch returned empty due to internal error
      if (vectorResults.length === 0 && !vectorSearchError) {
        // Vector search returned no results
        warning = warning || 'Vector search returned no results. Using FTS5 results.';
      }
    }

    // Transform FTS results to normalized format
    const ftsResults = ftsRawResults.map((row: any) => ({
      id: row.id,
      type: row.type,
      content: row.content.substring(0, 500), // Truncate for readability
      source_file: row.source_file,
      concepts: JSON.parse(row.concepts || '[]') as string[],
      score: this.normalizeFtsScore(row.rank),
      source: 'fts' as const,
    }));

    // Normalize vector scores (ChromaDB distances are already 0-1, but lower = better)
    // Convert to higher = better by using 1 - distance
    const normalizedVectorResults = vectorResults.map((result) => ({
      ...result,
      score: 1 - (result.score || 0), // Convert distance to similarity
    }));

    // Combine results using hybrid ranking
    const combinedResults = this.combineResults(ftsResults, normalizedVectorResults);

    // Total matches before pagination
    const totalMatches = combinedResults.length;

    // Apply pagination (offset + limit)
    const results = combinedResults.slice(offset, offset + limit);

    // Count sources for metadata
    const ftsCount = results.filter((r) => r.source === 'fts').length;
    const vectorCount = results.filter((r) => r.source === 'vector').length;
    const hybridCount = results.filter((r) => r.source === 'hybrid').length;

    // Calculate search time
    const searchTime = Date.now() - startTime;

    // Build metadata with optional warning
    const metadata: {
      mode: string;
      limit: number;
      offset: number;
      total: number;
      ftsMatches: number;
      vectorMatches: number;
      sources: { fts: number; vector: number; hybrid: number };
      searchTime: number;
      warning?: string;
    } = {
      mode,
      limit,
      offset,
      total: totalMatches,
      ftsMatches: ftsRawResults.length,
      vectorMatches: vectorResults.length,
      sources: {
        fts: ftsCount,
        vector: vectorCount,
        hybrid: hybridCount,
      },
      searchTime,
    };

    // Add warning if vector search failed
    if (warning) {
      metadata.warning = warning;
    }

    // Log the search to console
    console.error(`[MCP:SEARCH] "${query}" (${type}, ${mode}) → ${results.length} results in ${searchTime}ms`);

    // Log to database (so Activity page and session stats include MCP searches)
    try {
      logSearch(query, type, mode, results.length, searchTime, results);
    } catch (e) {
      console.error('[MCP:SEARCH] Failed to log search to database:', e);
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          results,
          total: results.length,
          query,
          metadata,
        }, null, 2)
      }]
    };
  }

  /**
   * Tool: oracle_consult
   * Get guidance based on principles and patterns
   */
  private async handleConsult(input: OracleConsultInput) {
    const { decision, context = '' } = input;
    const query = context ? `${decision} ${context}` : decision;
    const safeQuery = this.sanitizeFtsQuery(query);

    // Search for relevant principles
    const principleStmt = this.sqlite.prepare(`
      SELECT f.id, f.content, d.source_file
      FROM oracle_fts f
      JOIN oracle_documents d ON f.id = d.id
      WHERE oracle_fts MATCH ? AND d.type = 'principle'
      ORDER BY rank
      LIMIT 3
    `);
    const principles = principleStmt.all(safeQuery);

    // Search for relevant learnings
    const learningStmt = this.sqlite.prepare(`
      SELECT f.id, f.content, d.source_file
      FROM oracle_fts f
      JOIN oracle_documents d ON f.id = d.id
      WHERE oracle_fts MATCH ? AND d.type = 'learning'
      ORDER BY rank
      LIMIT 3
    `);
    const patterns = learningStmt.all(safeQuery);

    // Synthesize guidance
    const guidance = this.synthesizeGuidance(
      decision,
      principles.map((p: any) => p.content),
      patterns.map((p: any) => p.content)
    );

    // Log the consultation to database (Drizzle)
    try {
      this.db.insert(consultLog).values({
        decision,
        context: context || null,
        principlesFound: principles.length,
        patternsFound: patterns.length,
        guidance,
        createdAt: Date.now(),
      }).run();
    } catch (e) {
      // Ignore logging errors - table may not exist yet
      console.error('[ConsultLog]', e instanceof Error ? e.message : String(e));
    }

    // Log to console
    console.error(`[MCP:CONSULT] "${decision}" → ${principles.length} principles, ${patterns.length} patterns`);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          decision,
          principles: principles.map((p: any) => ({
            content: p.content.substring(0, 300),
            source: p.source_file
          })),
          patterns: patterns.map((p: any) => ({
            content: p.content.substring(0, 300),
            source: p.source_file
          })),
          guidance
        }, null, 2)
      }]
    };
  }

  /**
   * Tool: oracle_reflect
   * Return random wisdom
   */
  private async handleReflect(_input: OracleReflectInput) {
    // Drizzle for oracle_documents query
    const randomDoc = this.db.select({
      id: oracleDocuments.id,
      type: oracleDocuments.type,
      sourceFile: oracleDocuments.sourceFile,
      concepts: oracleDocuments.concepts,
    })
      .from(oracleDocuments)
      .where(inArray(oracleDocuments.type, ['principle', 'learning']))
      .orderBy(sql`RANDOM()`)
      .limit(1)
      .get();

    if (!randomDoc) {
      throw new Error('No documents found in Oracle knowledge base');
    }

    // Raw SQL for FTS content fetch (Drizzle doesn't support FTS5)
    const content = this.sqlite.prepare(`
      SELECT content FROM oracle_fts WHERE id = ?
    `).get(randomDoc.id) as { content: string };

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          principle: {
            id: randomDoc.id,
            type: randomDoc.type,
            content: content.content,
            source_file: randomDoc.sourceFile,
            concepts: JSON.parse(randomDoc.concepts || '[]')
          }
        }, null, 2)
      }]
    };
  }

  /**
   * Normalize project input to "github.com/owner/repo" format
   * Accepts:
   * - "github.com/owner/repo" → as-is
   * - "owner/repo" → "github.com/owner/repo"
   * - "https://github.com/owner/repo" → "github.com/owner/repo"
   * - "~/Code/github.com/owner/repo" → "github.com/owner/repo"
   * - "/Users/nat/Code/github.com/owner/repo/..." → "github.com/owner/repo"
   */
  private normalizeProject(input?: string): string | null {
    if (!input) return null;

    // Already normalized
    if (input.match(/^github\.com\/[^\/]+\/[^\/]+$/)) {
      return input;
    }

    // GitHub URL: https://github.com/owner/repo or http://github.com/owner/repo
    const urlMatch = input.match(/https?:\/\/github\.com\/([^\/]+\/[^\/]+)/);
    if (urlMatch) return `github.com/${urlMatch[1].replace(/\.git$/, '')}`;

    // Local path with github.com: ~/Code/github.com/owner/repo or /Users/.../github.com/owner/repo
    const pathMatch = input.match(/github\.com\/([^\/]+\/[^\/]+)/);
    if (pathMatch) return `github.com/${pathMatch[1]}`;

    // Short format: owner/repo (no slashes except the one between owner/repo)
    const shortMatch = input.match(/^([^\/\s]+\/[^\/\s]+)$/);
    if (shortMatch) return `github.com/${shortMatch[1]}`;

    return null;
  }

  /**
   * Extract project from source field (fallback)
   * Handles formats:
   * - "oracle_learn from github.com/owner/repo ..."
   * - "rrr: org/repo" or "rrr: Owner/Repo"
   */
  private extractProjectFromSource(source?: string): string | null {
    if (!source) return null;

    // Try "oracle_learn from github.com/owner/repo"
    const oracleLearnMatch = source.match(/from\s+(github\.com\/[^\/\s]+\/[^\/\s]+)/);
    if (oracleLearnMatch) return oracleLearnMatch[1];

    // Try "rrr: org/repo" format (convert to github.com/org/repo)
    const rrrMatch = source.match(/^rrr:\s*([^\/\s]+\/[^\/\s]+)/);
    if (rrrMatch) return `github.com/${rrrMatch[1]}`;

    // Try direct "github.com/owner/repo" anywhere in source
    const directMatch = source.match(/(github\.com\/[^\/\s]+\/[^\/\s]+)/);
    if (directMatch) return directMatch[1];

    return null;
  }

  /**
   * Tool: oracle_learn
   * Add new pattern/learning to knowledge base
   */
  private async handleLearn(input: OracleLearnInput) {
    const { pattern, source, concepts, project: projectInput } = input;
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD

    // Generate slug from pattern (first 50 chars, alphanumeric + dash)
    const slug = pattern
      .substring(0, 50)
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    const filename = `${dateStr}_${slug}.md`;
    const filePath = path.join(this.repoRoot, 'ψ/memory/learnings', filename);

    // Check if file already exists
    if (fs.existsSync(filePath)) {
      throw new Error(`File already exists: ${filename}`);
    }

    // Generate title from pattern
    const title = pattern.split('\n')[0].substring(0, 80);

    // Create frontmatter
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

    // Write file
    fs.writeFileSync(filePath, frontmatter, 'utf-8');

    // Index into database
    const id = `learning_${dateStr}_${slug}`;

    // Resolve project: explicit arg → parse from source → local detection
    const project = this.normalizeProject(projectInput)
      || this.extractProjectFromSource(source)
      || detectProject(this.repoRoot);

    // Insert metadata with provenance (Drizzle)
    this.db.insert(oracleDocuments).values({
      id,
      type: 'learning',
      sourceFile: `ψ/memory/learnings/${filename}`,
      concepts: JSON.stringify(conceptsList),
      createdAt: now.getTime(),
      updatedAt: now.getTime(),
      indexedAt: now.getTime(),
      origin: null,  // null = universal/mother
      project,
      createdBy: 'oracle_learn',
    }).run();

    // Insert into FTS
    this.sqlite.prepare(`
      INSERT INTO oracle_fts (id, content, concepts)
      VALUES (?, ?, ?)
    `).run(
      id,
      frontmatter,
      conceptsList.join(' ')
    );

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

  /**
   * Tool: oracle_list
   * List documents without search query, with pagination and type filtering
   */
  private async handleList(input: OracleListInput) {
    const { type = 'all', limit = 10, offset = 0 } = input;

    // Validate input
    if (limit < 1 || limit > 100) {
      throw new Error('limit must be between 1 and 100');
    }
    if (offset < 0) {
      throw new Error('offset must be >= 0');
    }

    const validTypes = ['principle', 'pattern', 'learning', 'retro', 'all'];
    if (!validTypes.includes(type)) {
      throw new Error(`Invalid type: ${type}. Must be one of: ${validTypes.join(', ')}`);
    }

    // Get total count (Drizzle)
    const countResult = type === 'all'
      ? this.db.select({ total: sql<number>`count(*)` }).from(oracleDocuments).get()
      : this.db.select({ total: sql<number>`count(*)` }).from(oracleDocuments).where(eq(oracleDocuments.type, type)).get();
    const total = countResult?.total ?? 0;

    // Get documents sorted by indexed_at DESC
    const listStmt = type === 'all'
      ? this.sqlite.prepare(`
          SELECT d.id, d.type, d.source_file, d.concepts, d.indexed_at, f.content
          FROM oracle_documents d
          JOIN oracle_fts f ON d.id = f.id
          ORDER BY d.indexed_at DESC
          LIMIT ? OFFSET ?
        `)
      : this.sqlite.prepare(`
          SELECT d.id, d.type, d.source_file, d.concepts, d.indexed_at, f.content
          FROM oracle_documents d
          JOIN oracle_fts f ON d.id = f.id
          WHERE d.type = ?
          ORDER BY d.indexed_at DESC
          LIMIT ? OFFSET ?
        `);

    const rows = type === 'all'
      ? listStmt.all(limit, offset)
      : listStmt.all(type, limit, offset);

    const documents = (rows as any[]).map((row) => ({
      id: row.id,
      type: row.type,
      title: row.content.split('\n')[0].substring(0, 80),
      content: row.content.substring(0, 500),
      source_file: row.source_file,
      concepts: JSON.parse(row.concepts || '[]'),
      indexed_at: row.indexed_at,
    }));

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          documents,
          total,
          limit,
          offset,
          type,
        }, null, 2)
      }]
    };
  }

  /**
   * Tool: oracle_stats
   * Get knowledge base statistics and health status
   */
  private async handleStats(_input: OracleStatsInput) {
    // Get document counts by type (Drizzle)
    const typeCounts = this.db.select({
      type: oracleDocuments.type,
      count: sql<number>`count(*)`,
    })
      .from(oracleDocuments)
      .groupBy(oracleDocuments.type)
      .all();

    const byType: Record<string, number> = {};
    let totalDocs = 0;
    for (const row of typeCounts) {
      byType[row.type] = row.count;
      totalDocs += row.count;
    }

    // Get FTS index count (raw SQL - FTS table)
    const ftsCount = this.sqlite.prepare('SELECT COUNT(*) as count FROM oracle_fts').get() as { count: number };

    // Get last indexed timestamp (Drizzle)
    const lastIndexed = this.db.select({
      lastIndexed: sql<number | null>`MAX(indexed_at)`,
    }).from(oracleDocuments).get();

    // Get concept count (Drizzle)
    const conceptsResult = this.db.select({
      concepts: oracleDocuments.concepts,
    })
      .from(oracleDocuments)
      .where(and(isNotNull(oracleDocuments.concepts), ne(oracleDocuments.concepts, '[]')))
      .all();

    const uniqueConcepts = new Set<string>();
    for (const row of conceptsResult) {
      try {
        const concepts = JSON.parse(row.concepts);
        if (Array.isArray(concepts)) {
          concepts.forEach((c: string) => uniqueConcepts.add(c));
        }
      } catch {
        // Ignore parse errors
      }
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          total_documents: totalDocs,
          by_type: byType,
          fts_indexed: ftsCount.count,
          unique_concepts: uniqueConcepts.size,
          last_indexed: lastIndexed?.lastIndexed
            ? new Date(lastIndexed.lastIndexed).toISOString()
            : null,
          chroma_status: this.chromaStatus,
          fts_status: ftsCount.count > 0 ? 'healthy' : 'empty',
          version: '0.2.1',
        }, null, 2)
      }]
    };
  }

  /**
   * Tool: oracle_concepts
   * List all concept tags with document counts
   */
  private async handleConcepts(input: OracleConceptsInput) {
    const { limit = 50, type = 'all' } = input;

    // Get all concepts from documents (Drizzle)
    const baseCondition = and(isNotNull(oracleDocuments.concepts), ne(oracleDocuments.concepts, '[]'));
    const rows = type === 'all'
      ? this.db.select({ concepts: oracleDocuments.concepts }).from(oracleDocuments).where(baseCondition).all()
      : this.db.select({ concepts: oracleDocuments.concepts }).from(oracleDocuments).where(and(baseCondition, eq(oracleDocuments.type, type))).all();

    // Count concept occurrences
    const conceptCounts = new Map<string, number>();
    for (const row of rows as Array<{ concepts: string }>) {
      try {
        const concepts = JSON.parse(row.concepts);
        if (Array.isArray(concepts)) {
          for (const concept of concepts) {
            if (typeof concept === 'string') {
              conceptCounts.set(concept, (conceptCounts.get(concept) || 0) + 1);
            }
          }
        }
      } catch {
        // Try comma-separated format
        if (typeof row.concepts === 'string') {
          const concepts = row.concepts.split(',').map(c => c.trim()).filter(Boolean);
          for (const concept of concepts) {
            conceptCounts.set(concept, (conceptCounts.get(concept) || 0) + 1);
          }
        }
      }
    }

    // Convert to sorted array
    const sortedConcepts = Array.from(conceptCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          concepts: sortedConcepts,
          total_unique: conceptCounts.size,
          filter_type: type,
        }, null, 2)
      }]
    };
  }

  /**
   * Synthesize guidance from principles and patterns
   */
  private synthesizeGuidance(decision: string, principles: string[], patterns: string[]): string {
    let guidance = `Based on Oracle philosophy:\n\n`;

    if (principles.length > 0) {
      guidance += `**Relevant Principles:**\n`;
      principles.forEach((p, i) => {
        guidance += `${i + 1}. ${p.substring(0, 200)}...\n`;
      });
      guidance += `\n`;
    }

    if (patterns.length > 0) {
      guidance += `**Relevant Patterns:**\n`;
      patterns.forEach((p, i) => {
        guidance += `${i + 1}. ${p.substring(0, 200)}...\n`;
      });
      guidance += `\n`;
    }

    if (principles.length === 0 && patterns.length === 0) {
      guidance += `No directly matching principles or patterns found for: "${decision}"\n`;
      guidance += `Try rephrasing your query or being more specific.\n`;
    } else {
      guidance += `**Recommendation:**\n`;
      guidance += `Consider these Oracle principles when making your decision about: "${decision}". `;
      guidance += `Remember: The Oracle Keeps the Human Human - this is guidance, not commands.`;
    }

    return guidance;
  }

  /**
   * Private: Normalize FTS5 rank score using exponential decay
   * FTS5 rank is negative, lower = better match
   * This converts to 0-1 scale where higher = better
   *
   * Uses exponential decay for better separation of top results:
   * - Rank -1 → 0.74 (best)
   * - Rank -3 → 0.41
   * - Rank -5 → 0.22
   * - Rank -10 → 0.05 (worst in typical results)
   *
   * @param rank - FTS5 rank (negative number)
   * @returns Normalized score between 0 and 1
   */
  private normalizeFtsScore(rank: number): number {
    // FTS5 rank is negative, more negative = better match
    // Exponential decay gives better separation for top results
    const absRank = Math.abs(rank);
    return Math.exp(-0.3 * absRank);
  }

  /**
   * Private: Combine FTS and vector search results
   * Deduplicates by document id, calculates hybrid score
   *
   * @param ftsResults - Results from FTS5 search
   * @param vectorResults - Results from vector search
   * @param ftsWeight - Weight for FTS score (default 0.5)
   * @param vectorWeight - Weight for vector score (default 0.5)
   * @returns Combined and sorted results
   */
  private combineResults(
    ftsResults: Array<{
      id: string;
      type: string;
      content: string;
      source_file: string;
      concepts: string[];
      score: number;
      source: 'fts';
    }>,
    vectorResults: Array<{
      id: string;
      type: string;
      content: string;
      source_file: string;
      concepts: string[];
      score: number;
      source: 'vector';
    }>,
    ftsWeight: number = 0.5,
    vectorWeight: number = 0.5
  ): Array<{
    id: string;
    type: string;
    content: string;
    source_file: string;
    concepts: string[];
    score: number;
    source: 'fts' | 'vector' | 'hybrid';
    ftsScore?: number;
    vectorScore?: number;
  }> {
    // Use Map for deduplication by document id
    const resultMap = new Map<string, {
      id: string;
      type: string;
      content: string;
      source_file: string;
      concepts: string[];
      ftsScore?: number;
      vectorScore?: number;
      source: 'fts' | 'vector' | 'hybrid';
    }>();

    // Add FTS results
    for (const result of ftsResults) {
      resultMap.set(result.id, {
        id: result.id,
        type: result.type,
        content: result.content,
        source_file: result.source_file,
        concepts: result.concepts,
        ftsScore: result.score,
        source: 'fts',
      });
    }

    // Add/merge vector results
    for (const result of vectorResults) {
      const existing = resultMap.get(result.id);
      if (existing) {
        // Document appears in both - mark as hybrid
        existing.vectorScore = result.score;
        existing.source = 'hybrid';
      } else {
        // New document from vector search only
        resultMap.set(result.id, {
          id: result.id,
          type: result.type,
          content: result.content,
          source_file: result.source_file,
          concepts: result.concepts,
          vectorScore: result.score,
          source: 'vector',
        });
      }
    }

    // Calculate hybrid scores and convert to array
    const combined = Array.from(resultMap.values()).map((result) => {
      let score: number;

      if (result.source === 'hybrid') {
        // Document found in both - combine scores with boost
        const fts = result.ftsScore ?? 0;
        const vec = result.vectorScore ?? 0;
        // 10% boost for appearing in both result sets
        score = ((ftsWeight * fts) + (vectorWeight * vec)) * 1.1;
      } else if (result.source === 'fts') {
        // FTS only - use FTS score with its weight
        score = (result.ftsScore ?? 0) * ftsWeight;
      } else {
        // Vector only - use vector score with its weight
        score = (result.vectorScore ?? 0) * vectorWeight;
      }

      return {
        id: result.id,
        type: result.type,
        content: result.content,
        source_file: result.source_file,
        concepts: result.concepts,
        score,
        source: result.source,
        ftsScore: result.ftsScore,
        vectorScore: result.vectorScore,
      };
    });

    // Sort by score descending (higher is better)
    combined.sort((a, b) => b.score - a.score);

    return combined;
  }

  /**
   * Private: Vector search using ChromaMcpClient (same uvx/chroma-mcp as indexer)
   * Performs semantic similarity search on the oracle_knowledge collection
   *
   * @param query - Natural language query
   * @param type - Document type filter ('all' for no filter)
   * @param limit - Maximum number of results
   * @returns Array of search results with source: 'vector'
   */
  private async vectorSearch(
    query: string,
    type: string,
    limit: number
  ): Promise<Array<{
    id: string;
    type: string;
    content: string;
    source_file: string;
    concepts: string[];
    score: number;
    source: 'vector';
  }>> {
    try {
      // Build where filter if type specified
      const whereFilter = type !== 'all' ? { type } : undefined;

      console.error(`[VectorSearch] Query: "${query.substring(0, 50)}..." limit=${limit}`);

      // Query via ChromaMcpClient (uses same embedding model as indexer)
      const results = await this.chromaMcp.query(query, limit, whereFilter);

      console.error(`[VectorSearch] Results: ${results.ids?.length || 0} documents`);

      // If no results, return empty array
      if (!results.ids || results.ids.length === 0) {
        return [];
      }

      // Map results to our format
      const mappedResults: Array<{
        id: string;
        type: string;
        content: string;
        source_file: string;
        concepts: string[];
        score: number;
        source: 'vector';
      }> = [];

      for (let i = 0; i < results.ids.length; i++) {
        const metadata = results.metadatas[i] as Record<string, unknown> | null;

        mappedResults.push({
          id: results.ids[i],
          type: (metadata?.type as string) || 'unknown',
          content: (results.documents[i] || '').substring(0, 500),
          source_file: (metadata?.source_file as string) || '',
          concepts: this.parseConceptsFromMetadata(metadata?.concepts),
          score: results.distances[i] || 0,
          source: 'vector',
        });
      }

      return mappedResults;
    } catch (error) {
      // Log error with [ChromaDB] prefix but don't throw - return empty array for graceful degradation
      const errorMsg = error instanceof Error ? error.stack || error.message : String(error);
      console.error('[ChromaDB ERROR]', errorMsg);
      // Also write to file for debugging
      const fs = await import('fs');
      fs.appendFileSync('/tmp/oracle-chroma-debug.log', `[${new Date().toISOString()}] ${errorMsg}\n`);
      return [];
    }
  }

  // ============================================================================
  // Forum Handlers
  // ============================================================================

  /**
   * Send message to thread, Oracle auto-responds
   */
  private async handleThread(input: OracleThreadInput) {
    const result = await handleThreadMessage({
      message: input.message,
      threadId: input.threadId,
      title: input.title,
      role: input.role || 'claude',  // MCP calls are from Claude
      model: input.model,            // e.g., 'opus', 'sonnet'
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

  /**
   * List threads with optional filters
   */
  private async handleThreads(input: OracleThreadsInput) {
    const result = listThreads({
      status: input.status as any,
      limit: input.limit || 20,
      offset: input.offset || 0,
    });

    // Get message count for each thread
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
        text: JSON.stringify({
          threads: threadsWithCounts,
          total: result.total,
        }, null, 2)
      }]
    };
  }

  /**
   * Read full thread with message history
   */
  private async handleThreadRead(input: OracleThreadReadInput) {
    const threadData = getFullThread(input.threadId);
    if (!threadData) {
      throw new Error(`Thread ${input.threadId} not found`);
    }

    let messages = threadData.messages.map(m => ({
      id: m.id,
      role: m.role,
      author: m.author,
      content: m.content,
      timestamp: new Date(m.createdAt).toISOString(),
    }));

    // Apply limit if specified
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

  /**
   * Update thread status
   */
  private async handleThreadUpdate(input: OracleThreadUpdateInput) {
    if (!input.status) {
      throw new Error('status is required');
    }

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

  // ============================================================================
  // Decision Tracking Handlers
  // ============================================================================

  /**
   * List decisions with optional filters
   */
  private async handleDecisionsList(input: OracleDecisionsListInput) {
    const result = listDecisions({
      status: input.status,
      project: input.project,
      tags: input.tags,
      limit: input.limit || 20,
      offset: input.offset || 0,
    });

    const counts = getDecisionCounts();

    console.error(`[MCP:DECISIONS_LIST] ${input.status || 'all'} → ${result.decisions.length} decisions`);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          decisions: result.decisions.map(d => ({
            id: d.id,
            title: d.title,
            status: d.status,
            context: d.context,
            decision: d.decision,
            project: d.project,
            tags: d.tags,
            created_at: new Date(d.createdAt).toISOString(),
            updated_at: new Date(d.updatedAt).toISOString(),
            decided_at: d.decidedAt ? new Date(d.decidedAt).toISOString() : null,
            decided_by: d.decidedBy,
          })),
          total: result.total,
          counts,
        }, null, 2)
      }]
    };
  }

  /**
   * Create a new decision
   */
  private async handleDecisionsCreate(input: OracleDecisionsCreateInput) {
    const decision = createDecision({
      title: input.title,
      context: input.context,
      options: input.options,
      tags: input.tags,
      project: input.project,
    });

    console.error(`[MCP:DECISIONS_CREATE] "${input.title}" → id=${decision.id}`);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          id: decision.id,
          title: decision.title,
          status: decision.status,
          project: decision.project,
          created_at: new Date(decision.createdAt).toISOString(),
        }, null, 2)
      }]
    };
  }

  /**
   * Get a single decision with full details
   */
  private async handleDecisionsGet(input: OracleDecisionsGetInput) {
    const decision = getDecision(input.id);
    if (!decision) {
      throw new Error(`Decision ${input.id} not found`);
    }

    console.error(`[MCP:DECISIONS_GET] id=${input.id} → "${decision.title}"`);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          id: decision.id,
          title: decision.title,
          status: decision.status,
          context: decision.context,
          options: decision.options,
          decision: decision.decision,
          rationale: decision.rationale,
          project: decision.project,
          tags: decision.tags,
          created_at: new Date(decision.createdAt).toISOString(),
          updated_at: new Date(decision.updatedAt).toISOString(),
          decided_at: decision.decidedAt ? new Date(decision.decidedAt).toISOString() : null,
          decided_by: decision.decidedBy,
        }, null, 2)
      }]
    };
  }

  /**
   * Update a decision (fields and/or status)
   */
  private async handleDecisionsUpdate(input: OracleDecisionsUpdateInput) {
    const decision = updateDecision({
      id: input.id,
      title: input.title,
      context: input.context,
      options: input.options,
      decision: input.decision,
      rationale: input.rationale,
      tags: input.tags,
      status: input.status,
      decidedBy: input.decidedBy,
    });

    if (!decision) {
      throw new Error(`Decision ${input.id} not found`);
    }

    console.error(`[MCP:DECISIONS_UPDATE] id=${input.id} → status=${decision.status}`);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          id: decision.id,
          title: decision.title,
          status: decision.status,
          updated_at: new Date(decision.updatedAt).toISOString(),
          decided_at: decision.decidedAt ? new Date(decision.decidedAt).toISOString() : null,
          decided_by: decision.decidedBy,
        }, null, 2)
      }]
    };
  }

  // ============================================================================
  // Trace Log Handlers (Issue #17)
  // ============================================================================

  /**
   * Tool: oracle_trace
   * Log a trace session with dig points
   */
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

  /**
   * Tool: oracle_trace_list
   * List recent traces with optional filters
   */
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

  /**
   * Tool: oracle_trace_get
   * Get full details of a specific trace
   */
  private async handleTraceGet(input: GetTraceInput) {
    const trace = getTrace(input.traceId);

    if (!trace) {
      throw new Error(`Trace ${input.traceId} not found`);
    }

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
          // Dig points
          found_files: trace.foundFiles,
          found_commits: trace.foundCommits,
          found_issues: trace.foundIssues,
          found_retrospectives: trace.foundRetrospectives,
          found_learnings: trace.foundLearnings,
          found_resonance: trace.foundResonance,
          // Counts
          file_count: trace.fileCount,
          commit_count: trace.commitCount,
          issue_count: trace.issueCount,
          // Recursion (hierarchical)
          parent_trace_id: trace.parentTraceId,
          child_trace_ids: trace.childTraceIds,
          // Linked chain (horizontal)
          prev_trace_id: trace.prevTraceId,
          next_trace_id: trace.nextTraceId,
          // Context
          project: trace.project,
          agent_count: trace.agentCount,
          duration_ms: trace.durationMs,
          // Distillation
          awakening: trace.awakening,
          distilled_to_id: trace.distilledToId,
          // Timestamps
          created_at: new Date(trace.createdAt).toISOString(),
          updated_at: new Date(trace.updatedAt).toISOString(),
          // Chain (if requested)
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

  /**
   * Tool: oracle_trace_link
   * Link two traces as a chain (prev → next)
   */
  private async handleTraceLink(input: { prevTraceId: string; nextTraceId: string }) {
    const result = linkTraces(input.prevTraceId, input.nextTraceId);

    if (!result.success) {
      throw new Error(result.message);
    }

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

  /**
   * Tool: oracle_trace_unlink
   * Remove a link between traces
   */
  private async handleTraceUnlink(input: { traceId: string; direction: 'prev' | 'next' }) {
    const result = unlinkTraces(input.traceId, input.direction);

    if (!result.success) {
      throw new Error(result.message);
    }

    console.error(`[MCP:TRACE_UNLINK] ${input.traceId} direction=${input.direction}`);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          message: result.message,
        }, null, 2)
      }]
    };
  }

  /**
   * Tool: oracle_trace_chain
   * Get the full linked chain for a trace
   */
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

  /**
   * Tool: oracle_supersede
   * Mark an old document as superseded by a newer one (Issue #19)
   */
  private async handleSupersede(input: OracleSupersededInput) {
    const { oldId, newId, reason } = input;
    const now = Date.now();

    // Verify both documents exist (Drizzle)
    const oldDoc = this.db.select({ id: oracleDocuments.id, type: oracleDocuments.type })
      .from(oracleDocuments)
      .where(eq(oracleDocuments.id, oldId))
      .get();
    const newDoc = this.db.select({ id: oracleDocuments.id, type: oracleDocuments.type })
      .from(oracleDocuments)
      .where(eq(oracleDocuments.id, newId))
      .get();

    if (!oldDoc) {
      throw new Error(`Old document not found: ${oldId}`);
    }
    if (!newDoc) {
      throw new Error(`New document not found: ${newId}`);
    }

    // Update the old document (Drizzle)
    this.db.update(oracleDocuments)
      .set({
        supersededBy: newId,
        supersededAt: now,
        supersededReason: reason || null,
      })
      .where(eq(oracleDocuments.id, oldId))
      .run();

    console.error(`[MCP:SUPERSEDE] ${oldId} → superseded by → ${newId}`);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          old_id: oldId,
          old_type: oldDoc.type,
          new_id: newId,
          new_type: newDoc.type,
          reason: reason || null,
          superseded_at: new Date(now).toISOString(),
          message: `"${oldId}" is now marked as superseded by "${newId}". It will still appear in searches with a warning.`
        }, null, 2)
      }]
    };
  }

  /**
   * Helper: Parse concepts from metadata
   * Handles both string (JSON) and array formats
   */
  private parseConceptsFromMetadata(concepts: unknown): string[] {
    if (!concepts) return [];
    if (Array.isArray(concepts)) return concepts;
    if (typeof concepts === 'string') {
      try {
        const parsed = JSON.parse(concepts);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  /**
   * Pre-connect to chroma-mcp before MCP server starts
   * This avoids stdio conflicts by establishing connection early
   */
  async preConnectChroma(): Promise<void> {
    await this.chromaMcp.connect();
  }

  /**
   * Start the MCP server
   */
  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Oracle Nightly MCP Server running on stdio (FTS5 mode)');
  }
}

/**
 * Main entry point
 * Pre-connect to chroma-mcp BEFORE starting MCP server to avoid stdio conflicts
 */
async function main() {
  // Check for read-only mode via env var or CLI arg
  const readOnly = process.env.ORACLE_READ_ONLY === 'true' || process.argv.includes('--read-only');
  const server = new OracleMCPServer({ readOnly });

  // Pre-connect to chroma-mcp before MCP server takes over stdio
  try {
    console.error('[Startup] Pre-connecting to chroma-mcp...');
    await server.preConnectChroma();
    console.error('[Startup] Chroma pre-connected successfully');
  } catch (e) {
    console.error('[Startup] Chroma pre-connect failed:', e instanceof Error ? e.message : e);
  }

  // Auto-start HTTP server if not running (Issue #24)
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
