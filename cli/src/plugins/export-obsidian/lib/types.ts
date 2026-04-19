/**
 * Shared types for the export-obsidian plugin.
 *
 * TODO(#933): switch to shared types once weaver's PR (part 1) lands.
 * This file is a placeholder written by the threader agent so that part 2
 * (fetch-docs + fetch-similar) can compile standalone.
 */

/** A single document returned by `GET /api/list`. */
export interface ApiDoc {
  id: string;
  type: string;
  content: string;
  source_file: string;
  concepts: string[];
  project?: string;
  created_at?: string;
  /** Some list responses use `indexed_at` instead of `created_at`. */
  indexed_at?: string;
}

/** A single similarity match returned by `GET /api/similar` (or /api/search vector mode). */
export interface SimilarResult {
  id: string;
  score: number;
  type?: string;
  source_file?: string;
}
