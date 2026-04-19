// Shared types for the export-obsidian plugin.
//
// TODO: This is a local duplicate. Weaver (#933 part 2 — fetchers / vault
// writer) owns the canonical version. Once weaver's branch merges, delete
// this file's interface bodies and re-export from weaver's module.

export interface ApiDoc {
  id: string;
  type: string;
  content: string;
  source_file?: string;
  concepts: string[];
  project?: string;
  created_at?: string;
}

export interface SimilarResult {
  id: string;
  score: number;
  type?: string;
  source_file?: string;
}

export interface DocMeta {
  arra_id: string;
  arra_type: string;
  arra_project?: string;
  arra_created?: string;
  arra_concepts: string[];
  arra_model: string;
  arra_similarity_threshold: number;
}

export interface VaultStats {
  total: number;
  byType: Record<string, number>;
  byProject: Record<string, number>;
  topConcepts: Array<{ name: string; count: number }>;
  topLinked?: Array<{ id: string; slug: string; linkCount: number }>;
  generatedAt: Date;
}
