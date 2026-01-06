/**
 * Oracle v2 MCP Server (MVP - FTS5 only)
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
import { ChromaClient, Collection } from 'chromadb';
import path from 'path';
import fs from 'fs';
import {
  handleThreadMessage,
  listThreads,
  getFullThread,
  getMessages,
  updateThreadStatus,
} from './forum/handler.js';

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

class OracleMCPServer {
  private server: Server;
  private db: Database.Database;
  private repoRoot: string;
  private chroma: ChromaClient;
  private collection: Collection | null = null;
  private chromaStatus: 'unknown' | 'connected' | 'unavailable' = 'unknown';

  constructor() {
    this.repoRoot = process.env.ORACLE_REPO_ROOT || '/Users/nat/Code/github.com/laris-co/Nat-s-Agents';

    // Initialize ChromaDB client (connects to default server at localhost:8000)
    this.chroma = new ChromaClient();

    this.server = new Server(
      {
        name: 'oracle-v2',
        version: '0.2.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize SQLite database
    const dbPath = path.join(this.repoRoot, 'ψ/lab/oracle-v2/oracle.db');
    this.db = new Database(dbPath);

    this.setupHandlers();
    this.setupErrorHandling();

    // Check ChromaDB health on startup (non-blocking)
    this.verifyChromaHealth();
  }

  /**
   * Verify ChromaDB connection health
   * Non-blocking - logs status and sets chromaStatus flag
   */
  private async verifyChromaHealth(): Promise<void> {
    try {
      const collections = await this.chroma.listCollections();
      // ChromaDB returns array of collection names (strings) or objects with name property
      const collectionNames = collections.map((c: string | { name: string }) =>
        typeof c === 'string' ? c : c.name
      );
      const exists = collectionNames.includes('oracle_knowledge');
      if (exists) {
        this.chromaStatus = 'connected';
        console.error('[ChromaDB] ✓ oracle_knowledge collection found');
      } else {
        this.chromaStatus = 'unavailable';
        console.error('[ChromaDB] ✗ Collection not found. Available:', collectionNames.join(', ') || 'none');
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
    this.db.close();
  }

  /**
   * Setup MCP handlers
   */
  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
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
        }
      ]
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
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
        const stmt = this.db.prepare(`
          SELECT f.id, f.content, d.type, d.source_file, d.concepts, rank
          FROM oracle_fts f
          JOIN oracle_documents d ON f.id = d.id
          WHERE oracle_fts MATCH ?
          ORDER BY rank
          LIMIT ?
        `);
        ftsRawResults = stmt.all(safeQuery, limit * 2);
      } else {
        const stmt = this.db.prepare(`
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

      // Check if vectorSearch returned empty due to internal error (it catches and returns [])
      // We can detect this if collection initialization failed
      if (vectorResults.length === 0 && !this.collection && !vectorSearchError) {
        // Collection never initialized - ChromaDB might be unavailable
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

    // Log the search
    console.error(`[MCP:SEARCH] "${query}" (${type}, ${mode}) → ${results.length} results in ${searchTime}ms`);

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
    const principleStmt = this.db.prepare(`
      SELECT f.id, f.content, d.source_file
      FROM oracle_fts f
      JOIN oracle_documents d ON f.id = d.id
      WHERE oracle_fts MATCH ? AND d.type = 'principle'
      ORDER BY rank
      LIMIT 3
    `);
    const principles = principleStmt.all(safeQuery);

    // Search for relevant learnings
    const learningStmt = this.db.prepare(`
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

    // Log the consultation to database
    try {
      this.db.prepare(`
        INSERT INTO consult_log (decision, context, principles_found, patterns_found, guidance, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        decision,
        context || null,
        principles.length,
        patterns.length,
        guidance,
        Date.now()
      );
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
    const randomDoc = this.db.prepare(`
      SELECT id, type, source_file, concepts FROM oracle_documents
      WHERE type IN ('principle', 'learning')
      ORDER BY RANDOM()
      LIMIT 1
    `).get() as OracleMetadata;

    if (!randomDoc) {
      throw new Error('No documents found in Oracle knowledge base');
    }

    // Get content from FTS
    const content = this.db.prepare(`
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
            source_file: randomDoc.source_file,
            concepts: JSON.parse(randomDoc.concepts || '[]')
          }
        }, null, 2)
      }]
    };
  }

  /**
   * Tool: oracle_learn
   * Add new pattern/learning to knowledge base
   */
  private async handleLearn(input: OracleLearnInput) {
    const { pattern, source, concepts } = input;
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

    // Insert metadata
    this.db.prepare(`
      INSERT INTO oracle_documents (id, type, source_file, concepts, created_at, updated_at, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      'learning',
      `ψ/memory/learnings/${filename}`,
      JSON.stringify(conceptsList),
      now.getTime(),
      now.getTime(),
      now.getTime()
    );

    // Insert into FTS
    this.db.prepare(`
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

    // Get total count
    const countStmt = type === 'all'
      ? this.db.prepare('SELECT COUNT(*) as total FROM oracle_documents')
      : this.db.prepare('SELECT COUNT(*) as total FROM oracle_documents WHERE type = ?');
    const countResult = type === 'all' ? countStmt.get() : countStmt.get(type);
    const total = (countResult as { total: number }).total;

    // Get documents sorted by indexed_at DESC
    const listStmt = type === 'all'
      ? this.db.prepare(`
          SELECT d.id, d.type, d.source_file, d.concepts, d.indexed_at, f.content
          FROM oracle_documents d
          JOIN oracle_fts f ON d.id = f.id
          ORDER BY d.indexed_at DESC
          LIMIT ? OFFSET ?
        `)
      : this.db.prepare(`
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
    // Get document counts by type
    const typeCounts = this.db.prepare(`
      SELECT type, COUNT(*) as count
      FROM oracle_documents
      GROUP BY type
    `).all() as Array<{ type: string; count: number }>;

    const byType: Record<string, number> = {};
    let totalDocs = 0;
    for (const row of typeCounts) {
      byType[row.type] = row.count;
      totalDocs += row.count;
    }

    // Get FTS index count
    const ftsCount = this.db.prepare('SELECT COUNT(*) as count FROM oracle_fts').get() as { count: number };

    // Get last indexed timestamp
    const lastIndexed = this.db.prepare(`
      SELECT MAX(indexed_at) as last_indexed FROM oracle_documents
    `).get() as { last_indexed: number | null };

    // Get concept count (approximate)
    const conceptsResult = this.db.prepare(`
      SELECT concepts FROM oracle_documents WHERE concepts IS NOT NULL AND concepts != '[]'
    `).all() as Array<{ concepts: string }>;

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
          last_indexed: lastIndexed.last_indexed
            ? new Date(lastIndexed.last_indexed).toISOString()
            : null,
          chroma_status: this.chromaStatus,
          fts_status: ftsCount.count > 0 ? 'healthy' : 'empty',
          version: '0.2.0',
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

    // Get all concepts from documents
    const stmt = type === 'all'
      ? this.db.prepare('SELECT concepts FROM oracle_documents WHERE concepts IS NOT NULL AND concepts != \'[]\'')
      : this.db.prepare('SELECT concepts FROM oracle_documents WHERE type = ? AND concepts IS NOT NULL AND concepts != \'[]\'');

    const rows = type === 'all' ? stmt.all() : stmt.all(type);

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
   * Private: Vector search using ChromaDB
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
      // Get or create the collection (lazy initialization)
      if (!this.collection) {
        this.collection = await this.chroma.getOrCreateCollection({
          name: 'oracle_knowledge',
        });
      }

      // Build query options
      const queryOptions: {
        queryTexts: string[];
        nResults: number;
        where?: { type: string };
      } = {
        queryTexts: [query],
        nResults: limit,
      };

      // Add type filter if not 'all'
      if (type !== 'all') {
        queryOptions.where = { type };
      }

      // Query the collection
      const results = await this.collection.query(queryOptions);

      // If no results, return empty array
      if (!results.ids || results.ids.length === 0 || !results.ids[0]) {
        return [];
      }

      // Map ChromaDB results to our format
      const mappedResults: Array<{
        id: string;
        type: string;
        content: string;
        source_file: string;
        concepts: string[];
        score: number;
        source: 'vector';
      }> = [];

      const ids = results.ids[0];
      const documents = results.documents?.[0] || [];
      const metadatas = results.metadatas?.[0] || [];
      const distances = results.distances?.[0] || [];

      for (let i = 0; i < ids.length; i++) {
        const metadata = metadatas[i] as Record<string, unknown> | null;

        mappedResults.push({
          id: ids[i],
          type: (metadata?.type as string) || 'unknown',
          content: (documents[i] || '').substring(0, 500), // Truncate for readability
          source_file: (metadata?.source_file as string) || '',
          concepts: this.parseConceptsFromMetadata(metadata?.concepts),
          score: distances[i] || 0,
          source: 'vector',
        });
      }

      return mappedResults;
    } catch (error) {
      // Log error with [ChromaDB] prefix but don't throw - return empty array for graceful degradation
      console.error('[ChromaDB]', error instanceof Error ? error.message : String(error));
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
   * Start the MCP server
   */
  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Oracle v2 MCP Server running on stdio (FTS5 mode)');
  }
}

/**
 * Main entry point
 */
const server = new OracleMCPServer();
server.run().catch(console.error);
