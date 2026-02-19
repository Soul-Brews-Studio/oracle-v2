/**
 * Oracle Tools — Barrel Export
 *
 * All tool definitions and handlers in one place.
 */

// Types
export type { ToolContext, ToolResponse } from './types.js';
export type {
  OracleSearchInput,
  OracleReflectInput,
  OracleLearnInput,
  OracleListInput,
  OracleStatsInput,
  OracleConceptsInput,
  OracleSupersededInput,
  OracleHandoffInput,
  OracleInboxInput,
  OracleVerifyInput,
} from './types.js';

// Search (+ pure helpers)
export {
  searchToolDef,
  handleSearch,
  sanitizeFtsQuery,
  normalizeFtsScore,
  parseConceptsFromMetadata,
  combineResults,
  vectorSearch,
} from './search.js';

// Learn (+ pure helpers)
export {
  learnToolDef,
  handleLearn,
  normalizeProject,
  extractProjectFromSource,
} from './learn.js';

// Reflect
export { reflectToolDef, handleReflect } from './reflect.js';

// List
export { listToolDef, handleList } from './list.js';

// Stats
export { statsToolDef, handleStats } from './stats.js';

// Concepts
export { conceptsToolDef, handleConcepts } from './concepts.js';

// Supersede
export { supersedeToolDef, handleSupersede } from './supersede.js';

// Handoff
export { handoffToolDef, handleHandoff } from './handoff.js';

// Inbox
export { inboxToolDef, handleInbox } from './inbox.js';

// Verify (bridge to verify/handler.ts)
export { verifyToolDef, handleVerify } from './verify.js';

/**
 * All tool definitions (for ListTools handler).
 * Does NOT include forum/trace/meta tools — those stay in index.ts.
 */
export const coreToolDefs = [
  // Imported lazily to avoid circular — use the named exports above
];
