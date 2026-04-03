/**
 * Handlers Index
 *
 * Re-exports all handlers from split modules.
 * This maintains backward compatibility while organizing code.
 */

// Search handlers
export { handleSearch } from './search.ts';

// Core handlers
export { handleReflect } from './reflect.ts';
export { handleList } from './list.ts';
export { handleStats } from './stats.ts';
export { handleGraph } from './graph.ts';
export { handleSimilar } from './similar.ts';

// Map handlers
export { handleMap, handleMap3d } from './map.ts';

// Vector stats
export { handleVectorStats } from './vector-stats.ts';

// Learn handler
export { handleLearn } from './learn.ts';

// Type exports
export type { SearchResult } from '../types.ts';
export type { SearchResponse } from '../types.ts';
