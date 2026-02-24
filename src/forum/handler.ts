/**
 * Oracle Forum Handler
 *
 * DB-first threaded discussions with Oracle.
 * - Create threads, add messages
 * - Oracle auto-responds from knowledge base
 * - Logs unanswered questions for later
 *
 * Refactored to use Drizzle ORM for type-safe queries.
 */

import { eq, desc, and, sql } from 'drizzle-orm';
import { db, forumThreads, forumMessages } from '../db/index.ts';
import { getProjectContext } from '../server/context.ts';
import type {
  ForumThread,
  ForumMessage,
  ThreadStatus,
  MessageRole,
  OracleThreadInput,
  OracleThreadOutput,
} from './types.ts';

/**
 * Get project context from environment (ghq path detection)
 */
function getProjectContext_(): string | undefined {
  const projectCtx = getProjectContext(process.cwd());
  return projectCtx && 'repo' in projectCtx ? projectCtx.repo : undefined;
}

// ============================================================================
// Thread Operations
// ============================================================================

/**
 * Create a new thread
 */
export function createThread(
  title: string,
  createdBy: string = 'user',
  project?: string
): ForumThread {
  const now = Date.now();

  const result = db.insert(forumThreads).values({
    title,
    createdBy,
    status: 'active',
    project: project || null,
    createdAt: now,
    updatedAt: now,
  }).returning({ id: forumThreads.id }).get();

  return {
    id: result.id,
    title,
    createdBy,
    status: 'active',
    project,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Get thread by ID
 */
export function getThread(threadId: number): ForumThread | null {
  const row = db.select()
    .from(forumThreads)
    .where(eq(forumThreads.id, threadId))
    .get();

  if (!row) return null;

  return {
    id: row.id,
    title: row.title,
    createdBy: row.createdBy || 'unknown',
    status: (row.status || 'active') as ThreadStatus,
    issueUrl: row.issueUrl || undefined,
    issueNumber: row.issueNumber || undefined,
    project: row.project || undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    syncedAt: row.syncedAt || undefined,
  };
}

/**
 * Update thread status
 */
export function updateThreadStatus(threadId: number, status: ThreadStatus): void {
  db.update(forumThreads)
    .set({ status, updatedAt: Date.now() })
    .where(eq(forumThreads.id, threadId))
    .run();
}

/**
 * List threads with optional filters
 */
export function listThreads(options: {
  status?: ThreadStatus;
  project?: string;
  limit?: number;
  offset?: number;
} = {}): { threads: ForumThread[]; total: number } {
  const { status, project, limit = 20, offset = 0 } = options;

  // Build conditions array
  const conditions = [];
  if (status) {
    conditions.push(eq(forumThreads.status, status));
  }
  if (project) {
    conditions.push(eq(forumThreads.project, project));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Get count
  const countResult = db.select({ count: sql<number>`count(*)` })
    .from(forumThreads)
    .where(whereClause)
    .get();
  const total = countResult?.count || 0;

  // Get threads
  const rows = db.select()
    .from(forumThreads)
    .where(whereClause)
    .orderBy(desc(forumThreads.updatedAt))
    .limit(limit)
    .offset(offset)
    .all();

  return {
    threads: rows.map(row => ({
      id: row.id,
      title: row.title,
      createdBy: row.createdBy || 'unknown',
      status: (row.status || 'active') as ThreadStatus,
      issueUrl: row.issueUrl || undefined,
      issueNumber: row.issueNumber || undefined,
      project: row.project || undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      syncedAt: row.syncedAt || undefined,
    })),
    total,
  };
}

// ============================================================================
// Message Operations
// ============================================================================

/**
 * Add a message to a thread
 */
export function addMessage(
  threadId: number,
  role: MessageRole,
  content: string,
  options: {
    author?: string;
    principlesFound?: number;
    patternsFound?: number;
    searchQuery?: string;
  } = {}
): ForumMessage {
  const now = Date.now();

  const result = db.insert(forumMessages).values({
    threadId,
    role,
    content,
    author: options.author || null,
    principlesFound: options.principlesFound || null,
    patternsFound: options.patternsFound || null,
    searchQuery: options.searchQuery || null,
    createdAt: now,
  }).returning({ id: forumMessages.id }).get();

  // Update thread timestamp
  db.update(forumThreads)
    .set({ updatedAt: now })
    .where(eq(forumThreads.id, threadId))
    .run();

  return {
    id: result.id,
    threadId,
    role,
    content,
    author: options.author,
    principlesFound: options.principlesFound,
    patternsFound: options.patternsFound,
    searchQuery: options.searchQuery,
    createdAt: now,
  };
}

/**
 * Get messages for a thread
 */
export function getMessages(threadId: number): ForumMessage[] {
  const rows = db.select()
    .from(forumMessages)
    .where(eq(forumMessages.threadId, threadId))
    .orderBy(forumMessages.createdAt)
    .all();

  return rows.map(row => ({
    id: row.id,
    threadId: row.threadId,
    role: row.role as MessageRole,
    content: row.content,
    author: row.author || undefined,
    principlesFound: row.principlesFound || undefined,
    patternsFound: row.patternsFound || undefined,
    searchQuery: row.searchQuery || undefined,
    commentId: row.commentId || undefined,
    createdAt: row.createdAt,
  }));
}

// ============================================================================
// Oracle Auto-Response
// ============================================================================

/**
 * Generate Oracle response for a question.
 * Stub: oracle_consult was removed. Returns null (no auto-response).
 */
export async function generateOracleResponse(
  _question: string,
  _context?: string
): Promise<{
  response: string;
  principlesFound: number;
  patternsFound: number;
} | null> {
  return null;
}

// ============================================================================
// Main Thread API (MCP Tool Interface)
// ============================================================================

/**
 * Main entry point: Send message to thread, Oracle auto-responds
 */
export async function handleThreadMessage(
  input: OracleThreadInput
): Promise<OracleThreadOutput> {
  const { message, threadId, title, role = 'human', model } = input;

  // Get project context
  const project = getProjectContext_();

  // Determine author based on role and model
  // - role='human' (HTTP) -> author='user'
  // - role='claude' (MCP) -> author='opus'/'sonnet'/'claude' + project
  let author: string;
  if (role === 'human') {
    author = 'user';
  } else {
    // Use model name if provided (opus, sonnet), else 'claude'
    author = model || 'claude';
  }

  // Add project context if available
  if (project) {
    author = `${author}@${project}`;
  }

  let thread: ForumThread;

  // Create or get thread
  if (threadId) {
    const existing = getThread(threadId);
    if (!existing) {
      throw new Error(`Thread ${threadId} not found`);
    }
    thread = existing;
  } else {
    // New thread - use title or first 50 chars of message
    const threadTitle = title || message.slice(0, 50) + (message.length > 50 ? '...' : '');
    thread = createThread(threadTitle, author, project);
  }

  // Add the user's message
  const userMessage = addMessage(thread.id, role, message, {
    author,
  });

  // Try to generate Oracle response (for any question)
  let oracleResponse: OracleThreadOutput['oracleResponse'];

  if (role === 'human' || role === 'claude') {
    const response = await generateOracleResponse(message);

    if (response) {
      // Oracle has an answer
      addMessage(thread.id, 'oracle', response.response, {
        author: 'oracle',
        principlesFound: response.principlesFound,
        patternsFound: response.patternsFound,
        searchQuery: message,
      });

      oracleResponse = {
        content: response.response,
        principlesFound: response.principlesFound,
        patternsFound: response.patternsFound,
      };

      updateThreadStatus(thread.id, 'answered');
    } else {
      // No answer - mark as pending for later
      updateThreadStatus(thread.id, 'pending');
    }
  }

  // Get updated thread status
  const updatedThread = getThread(thread.id)!;

  return {
    threadId: thread.id,
    messageId: userMessage.id,
    oracleResponse,
    status: updatedThread.status as ThreadStatus,
    issueUrl: updatedThread.issueUrl,
  };
}

/**
 * Get full thread with all messages
 */
export function getFullThread(threadId: number): {
  thread: ForumThread;
  messages: ForumMessage[];
} | null {
  const thread = getThread(threadId);
  if (!thread) return null;

  const messages = getMessages(threadId);
  return { thread, messages };
}
