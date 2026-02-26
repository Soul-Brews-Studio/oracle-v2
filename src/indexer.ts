/**
 * Oracle v2 Indexer
 *
 * Parses markdown files from ψ/memory and creates:
 * 1. SQLite index (source of truth for metadata)
 * 2. Chroma vectors (semantic search)
 *
 * Following claude-mem's granular vector pattern:
 * - Split large documents into smaller chunks
 * - Each principle/pattern becomes multiple vectors
 * - Enable concept-based filtering
 *
 * Uses chroma-mcp (Python) via MCP protocol for embeddings.
 * This avoids pnpm/npm dynamic import issues with chromadb-default-embed.
 */

import fs from 'fs';
import path from 'path';
import { Database } from 'bun:sqlite';
import { drizzle, BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { eq, or, isNull, inArray } from 'drizzle-orm';
import * as schema from './db/schema.ts';
import { oracleDocuments, indexingStatus } from './db/schema.ts';
import { ChromaMcpClient } from './chroma-mcp.ts';
import { detectProject } from './server/project-detect.ts';
import { getVaultPsiRoot } from './vault/handler.ts';
import type { OracleDocument, OracleMetadata, IndexerConfig } from './types.ts';

export class OracleIndexer {
  private sqlite: Database;  // Raw bun:sqlite for FTS and schema operations
  private db: BunSQLiteDatabase<typeof schema>;  // Drizzle for type-safe queries
  private chromaClient: ChromaMcpClient | null = null;
  private config: IndexerConfig;
  private project: string | null;
  private seenContentHashes: Set<string> = new Set();  // Content dedup across projects

  constructor(config: IndexerConfig) {
    this.config = config;
    this.sqlite = new Database(config.dbPath);  // Raw connection for FTS and schema
    this.sqlite.exec('PRAGMA journal_mode = WAL');
    this.sqlite.exec('PRAGMA busy_timeout = 5000');
    this.db = drizzle(this.sqlite, { schema });  // Drizzle wrapper for type-safe queries
    this.project = detectProject(config.repoRoot);
    console.log(`[Indexer] Detected project: ${this.project || '(universal)'}`);
    this.initDatabase();
  }

  /**
   * Initialize SQLite schema
   */
  private initDatabase(): void {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS oracle_documents (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        source_file TEXT NOT NULL,
        concepts TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        indexed_at INTEGER NOT NULL,
        project TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_type ON oracle_documents(type);
      CREATE INDEX IF NOT EXISTS idx_source ON oracle_documents(source_file);

      -- FTS5 for keyword search (with Porter stemmer for tire/tired matching)
      CREATE VIRTUAL TABLE IF NOT EXISTS oracle_fts USING fts5(
        id UNINDEXED,
        content,
        concepts,
        tokenize='porter unicode61'
      );

      -- Consult log for tracking oracle_consult queries
      CREATE TABLE IF NOT EXISTS consult_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        decision TEXT NOT NULL,
        context TEXT,
        principles_found INTEGER NOT NULL,
        patterns_found INTEGER NOT NULL,
        guidance TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_consult_created ON consult_log(created_at);

      -- Indexing status for tray app
      CREATE TABLE IF NOT EXISTS indexing_status (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        is_indexing INTEGER NOT NULL DEFAULT 0,
        progress_current INTEGER DEFAULT 0,
        progress_total INTEGER DEFAULT 0,
        started_at INTEGER,
        completed_at INTEGER,
        error TEXT
      );

      -- Ensure single row exists
      INSERT OR IGNORE INTO indexing_status (id, is_indexing) VALUES (1, 0);
    `);
  }

  /**
   * Update indexing status for tray app
   */
  private setIndexingStatus(isIndexing: boolean, current: number = 0, total: number = 0, error?: string): void {
    // Ensure repo_root column exists (migration)
    try {
      this.sqlite.exec('ALTER TABLE indexing_status ADD COLUMN repo_root TEXT');
    } catch {
      // Column already exists
    }

    this.sqlite.prepare(`
      UPDATE indexing_status SET
        is_indexing = ?,
        progress_current = ?,
        progress_total = ?,
        started_at = CASE WHEN ? = 1 AND started_at IS NULL THEN ? ELSE started_at END,
        completed_at = CASE WHEN ? = 0 THEN ? ELSE NULL END,
        error = ?,
        repo_root = ?
      WHERE id = 1
    `).run(
      isIndexing ? 1 : 0,
      current,
      total,
      isIndexing ? 1 : 0,
      Date.now(),
      isIndexing ? 1 : 0,
      Date.now(),
      error || null,
      this.config.repoRoot
    );
  }

  /**
   * Backup database before destructive operations
   * Philosophy: "Nothing is Deleted" - always preserve data
   *
   * Creates:
   * 1. SQLite file backup (.backup-TIMESTAMP)
   * 2. JSON export (.export-TIMESTAMP.json) for portability
   * 3. CSV export (.export-TIMESTAMP.csv) for DuckDB/analytics
   */
  private backupDatabase(): void {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${this.config.dbPath}.backup-${timestamp}`;
    const jsonPath = `${this.config.dbPath}.export-${timestamp}.json`;
    const csvPath = `${this.config.dbPath}.export-${timestamp}.csv`;

    // 1. Copy SQLite file
    try {
      fs.copyFileSync(this.config.dbPath, backupPath);
      console.log(`📦 DB backup: ${backupPath}`);
    } catch (e) {
      console.warn(`⚠️ DB backup failed: ${e instanceof Error ? e.message : e}`);
    }

    // Query all documents for export
    let docs: any[] = [];
    try {
      docs = this.sqlite.prepare(`
        SELECT d.id, d.type, d.source_file, d.concepts, d.project, f.content
        FROM oracle_documents d
        JOIN oracle_fts f ON d.id = f.id
      `).all() as any[];
    } catch (e) {
      console.warn(`⚠️ Query failed: ${e instanceof Error ? e.message : e}`);
      return;
    }

    // 2. Export to JSON (portable, human-readable)
    try {
      const exportData = {
        exported_at: new Date().toISOString(),
        count: docs.length,
        documents: docs.map(d => ({
          ...d,
          concepts: JSON.parse(d.concepts || '[]')
        }))
      };
      fs.writeFileSync(jsonPath, JSON.stringify(exportData, null, 2));
      console.log(`📄 JSON export: ${jsonPath} (${docs.length} docs)`);
    } catch (e) {
      console.warn(`⚠️ JSON export failed: ${e instanceof Error ? e.message : e}`);
    }

    // 3. Export to CSV (DuckDB-friendly)
    try {
      const escapeCSV = (val: string) => {
        if (val.includes('"') || val.includes(',') || val.includes('\n')) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      };

      const header = 'id,type,source_file,concepts,project,content';
      const rows = docs.map(d =>
        [d.id, d.type, d.source_file, d.concepts, d.project || '', d.content]
          .map(v => escapeCSV(String(v || '')))
          .join(',')
      );

      fs.writeFileSync(csvPath, [header, ...rows].join('\n'));
      console.log(`📊 CSV export: ${csvPath} (${docs.length} rows)`);
    } catch (e) {
      console.warn(`⚠️ CSV export failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  /**
   * Main indexing workflow
   */
  async index(): Promise<void> {
    console.log('Starting Oracle indexing...');

    // Reset dedup for fresh index run
    this.seenContentHashes.clear();

    // Set indexing status for tray app
    this.setIndexingStatus(true, 0, 100);

    // SAFETY: Backup before clearing (Nothing is Deleted)
    this.backupDatabase();

    // Smart deletion: delete indexer-created docs whose source file no longer exists on disk.
    // Safe for multi-project vault: only removes docs with missing files, preserves oracle_learn docs.
    const allIndexerDocs = this.db.select({ id: oracleDocuments.id, sourceFile: oracleDocuments.sourceFile })
      .from(oracleDocuments)
      .where(
        or(eq(oracleDocuments.createdBy, 'indexer'), isNull(oracleDocuments.createdBy))
      )
      .all();

    const idsToDelete = allIndexerDocs
      .filter(d => !fs.existsSync(path.join(this.config.repoRoot, d.sourceFile)))
      .map(d => d.id);
    console.log(`Smart delete: ${idsToDelete.length} stale docs (preserving oracle_learn)`);

    if (idsToDelete.length > 0) {
      // Delete from oracle_documents (Drizzle)
      this.db.delete(oracleDocuments)
        .where(inArray(oracleDocuments.id, idsToDelete))
        .run();

      // Delete from FTS (raw SQL required for FTS5)
      const BATCH_SIZE = 500;
      for (let i = 0; i < idsToDelete.length; i += BATCH_SIZE) {
        const batch = idsToDelete.slice(i, i + BATCH_SIZE);
        const placeholders = batch.map(() => '?').join(',');
        this.sqlite.prepare(`DELETE FROM oracle_fts WHERE id IN (${placeholders})`).run(...batch);
      }
    }

    // Initialize ChromaMcpClient (uses chroma-mcp Python server)
    try {
      this.chromaClient = new ChromaMcpClient(
        'oracle_knowledge',
        this.config.chromaPath,
        '3.12'  // Python version
      );
      await this.chromaClient.deleteCollection();
      await this.chromaClient.ensureCollection();
      console.log('ChromaDB connected via MCP');
    } catch (e) {
      console.log('ChromaDB not available, using SQLite-only mode:', e instanceof Error ? e.message : e);
      this.chromaClient = null;
    }

    const documents: OracleDocument[] = [];

    // Index each source type
    documents.push(...await this.indexResonance());
    documents.push(...await this.indexLearnings());
    documents.push(...await this.indexRetrospectives());

    // Store in SQLite + Chroma
    await this.storeDocuments(documents);

    // Mark indexing complete
    this.setIndexingStatus(false, documents.length, documents.length);
    console.log(`Indexed ${documents.length} documents`);
    console.log('Indexing complete!');
  }

  /**
   * Index ψ/memory/resonance/ files (identity, principles)
   */
  private async indexResonance(): Promise<OracleDocument[]> {
    const documents: OracleDocument[] = [];
    let totalFiles = 0;

    // 1. Root ψ/memory/resonance/
    const resonancePath = path.join(this.config.repoRoot, this.config.sourcePaths.resonance);
    if (fs.existsSync(resonancePath)) {
      const files = this.getAllMarkdownFiles(resonancePath);
      if (files.length === 0) {
        console.log(`Warning: ${resonancePath} exists but contains no .md files`);
      }
      for (const filePath of files) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const relPath = path.relative(this.config.repoRoot, filePath);
        const docs = this.parseResonanceFile(relPath, content, relPath);
        documents.push(...docs);
      }
      totalFiles += files.length;
    }

    // 2. Project-first vault dirs: github.com/*/*/ψ/memory/resonance/
    let skippedDupes = 0;
    const projectDirs = this.discoverProjectPsiDirs();
    for (const projectDir of projectDirs) {
      const projectResonance = path.join(projectDir, 'memory', 'resonance');
      if (!fs.existsSync(projectResonance)) continue;
      const files = this.getAllMarkdownFiles(projectResonance);
      for (const filePath of files) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const contentHash = Bun.hash(content).toString(36);
        if (this.seenContentHashes.has(contentHash)) {
          skippedDupes++;
          continue;
        }
        this.seenContentHashes.add(contentHash);
        const relPath = path.relative(this.config.repoRoot, filePath);
        const docs = this.parseResonanceFile(relPath, content, relPath);
        documents.push(...docs);
      }
      totalFiles += files.length;
    }

    console.log(`Indexed ${documents.length} resonance documents from ${totalFiles} files (skipped ${skippedDupes} duplicate files)`);
    return documents;
  }

  /**
   * Parse resonance markdown into granular documents
   * Following claude-mem's pattern of splitting by sections
   * Now reads frontmatter tags and inherits them to all chunks
   */
  private parseResonanceFile(filename: string, content: string, sourceFileOverride?: string): OracleDocument[] {
    const documents: OracleDocument[] = [];
    const sourceFile = sourceFileOverride || `ψ/memory/resonance/${filename}`;
    const now = Date.now();

    // Extract file-level tags from frontmatter
    const fileTags = this.parseFrontmatterTags(content);

    // Infer project from path
    const fileProject = this.parseFrontmatterProject(content)
      || this.inferProjectFromPath(sourceFile);

    // Split by ### headers (principles, sections)
    const sections = content.split(/^###\s+/m).filter(s => s.trim());

    sections.forEach((section, index) => {
      const lines = section.split('\n');
      const title = lines[0].trim();
      const body = lines.slice(1).join('\n').trim();

      if (!body) return;

      // Main document for this principle/section
      const id = `resonance_${filename.replace('.md', '')}_${index}`;
      const extractedConcepts = this.extractConcepts(title, body);
      documents.push({
        id,
        type: 'principle',
        source_file: sourceFile,
        content: `${title}: ${body}`,
        concepts: this.mergeConceptsWithTags(extractedConcepts, fileTags),
        created_at: now,
        updated_at: now,
        project: fileProject || undefined
      });

      // Split bullet points into sub-documents (granular pattern)
      const bullets = body.match(/^[-*]\s+(.+)$/gm);
      if (bullets) {
        bullets.forEach((bullet, bulletIndex) => {
          const bulletText = bullet.replace(/^[-*]\s+/, '').trim();
          const bulletConcepts = this.extractConcepts(bulletText);
          documents.push({
            id: `${id}_sub_${bulletIndex}`,
            type: 'principle',
            source_file: sourceFile,
            content: bulletText,
            concepts: this.mergeConceptsWithTags(bulletConcepts, fileTags),
            created_at: now,
            updated_at: now,
            project: fileProject || undefined
          });
        });
      }
    });

    return documents;
  }

  /**
   * Index ψ/memory/learnings/ files (patterns discovered)
   * Also scans project-first vault dirs: github.com/org/repo/ψ/memory/learnings/
   */
  private async indexLearnings(): Promise<OracleDocument[]> {
    const documents: OracleDocument[] = [];
    let totalFiles = 0;

    // 1. Root ψ/memory/learnings/
    const learningsPath = path.join(this.config.repoRoot, this.config.sourcePaths.learnings);
    if (fs.existsSync(learningsPath)) {
      const files = this.getAllMarkdownFiles(learningsPath);
      if (files.length === 0) {
        console.log(`Warning: ${learningsPath} exists but contains no .md files`);
      }
      for (const filePath of files) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const relPath = path.relative(this.config.repoRoot, filePath);
        const docs = this.parseLearningFile(relPath, content, relPath);
        documents.push(...docs);
      }
      totalFiles += files.length;
    }

    // 2. Project-first vault dirs: github.com/*/*/ψ/memory/learnings/
    let skippedDupes = 0;
    const projectDirs = this.discoverProjectPsiDirs();
    for (const projectDir of projectDirs) {
      const projectLearnings = path.join(projectDir, 'memory', 'learnings');
      if (!fs.existsSync(projectLearnings)) continue;
      const files = this.getAllMarkdownFiles(projectLearnings);
      for (const filePath of files) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const contentHash = Bun.hash(content).toString(36);
        if (this.seenContentHashes.has(contentHash)) {
          skippedDupes++;
          continue;
        }
        this.seenContentHashes.add(contentHash);
        const relPath = path.relative(this.config.repoRoot, filePath);
        const docs = this.parseLearningFile(relPath, content, relPath);
        documents.push(...docs);
      }
      totalFiles += files.length;
    }

    console.log(`Indexed ${documents.length} learning documents from ${totalFiles} files (skipped ${skippedDupes} duplicate files)`);
    return documents;
  }

  /**
   * Discover project-first psi directories in vault.
   * Scans {host}/{org}/{repo}/psi/ at repoRoot for github.com, gitlab.com, bitbucket.org.
   * Returns absolute paths to each project's psi directory.
   */
  private discoverProjectPsiDirs(): string[] {
    const dirs: string[] = [];
    const hosts = ['github.com', 'gitlab.com', 'bitbucket.org'];

    for (const host of hosts) {
      const hostDir = path.join(this.config.repoRoot, host);
      if (!fs.existsSync(hostDir)) continue;

      for (const org of fs.readdirSync(hostDir)) {
        const orgDir = path.join(hostDir, org);
        if (!fs.statSync(orgDir).isDirectory()) continue;

        for (const repo of fs.readdirSync(orgDir)) {
          const psiDir = path.join(orgDir, repo, 'ψ');
          if (fs.existsSync(psiDir) && fs.statSync(psiDir).isDirectory()) {
            dirs.push(psiDir);
          }
        }
      }
    }

    if (dirs.length > 0) {
      console.log(`Discovered ${dirs.length} project-first ψ/ directories`);
    }
    return dirs;
  }

  /**
   * Infer project from a vault-nested path.
   * Project-first layout: "github.com/org/repo/ψ/..." → "github.com/org/repo"
   * Also supports legacy layout: "ψ/memory/{category}/github.com/org/repo/..."
   */
  private inferProjectFromPath(relativePath: string): string | null {
    // Project-first layout: github.com/org/repo/ψ/...
    const projectFirst = relativePath.match(
      /^(github\.com|gitlab\.com|bitbucket\.org)\/([^/]+\/[^/]+)\/ψ\//
    );
    if (projectFirst) {
      return `${projectFirst[1]}/${projectFirst[2]}`.toLowerCase();
    }

    // Legacy layout: ψ/memory/{category}/github.com/org/repo/...
    const legacy = relativePath.match(
      /^ψ\/(?:memory\/(?:learnings|retrospectives)|inbox\/handoff)\/(github\.com|gitlab\.com|bitbucket\.org)\/([^/]+\/[^/]+)\//
    );
    if (legacy) {
      return `${legacy[1]}/${legacy[2]}`.toLowerCase();
    }

    return null;
  }

  /**
   * Parse learning markdown into documents
   * Now reads frontmatter tags and project, inherits them to all chunks.
   * Falls back to path-based project inference for vault-nested files.
   * @param filename - relative name within learnings dir (legacy) or full relative path
   * @param content - markdown content
   * @param sourceFileOverride - if provided, use as sourceFile instead of generating from filename
   */
  private parseLearningFile(filename: string, content: string, sourceFileOverride?: string): OracleDocument[] {
    const documents: OracleDocument[] = [];
    const sourceFile = sourceFileOverride || `ψ/memory/learnings/${filename}`;
    const now = Date.now();

    // Extract file-level tags and project from frontmatter
    const fileTags = this.parseFrontmatterTags(content);
    const fileProject = this.parseFrontmatterProject(content)
      || this.inferProjectFromPath(sourceFile);

    // Extract title from frontmatter or filename
    const titleMatch = content.match(/^title:\s*(.+)$/m);
    const title = titleMatch ? titleMatch[1] : filename.replace('.md', '');

    // Split by ## headers (patterns)
    const sections = content.split(/^##\s+/m).filter(s => s.trim());

    sections.forEach((section, index) => {
      const lines = section.split('\n');
      const sectionTitle = lines[0].trim();
      const body = lines.slice(1).join('\n').trim();

      if (!body) return;

      const id = `learning_${filename.replace('.md', '')}_${index}`;
      const extractedConcepts = this.extractConcepts(sectionTitle, body);
      documents.push({
        id,
        type: 'learning',
        source_file: sourceFile,
        content: `${title} - ${sectionTitle}: ${body}`,
        concepts: this.mergeConceptsWithTags(extractedConcepts, fileTags),
        created_at: now,
        updated_at: now,
        project: fileProject || undefined
      });
    });

    // If no sections, treat whole file as one document
    if (documents.length === 0) {
      const extractedConcepts = this.extractConcepts(title, content);
      documents.push({
        id: `learning_${filename.replace('.md', '')}`,
        type: 'learning',
        source_file: sourceFile,
        content: content,
        concepts: this.mergeConceptsWithTags(extractedConcepts, fileTags),
        created_at: now,
        updated_at: now,
        project: fileProject || undefined
      });
    }

    return documents;
  }

  /**
   * Index retrospective files from root and project-first vault dirs.
   */
  private async indexRetrospectives(): Promise<OracleDocument[]> {
    const documents: OracleDocument[] = [];
    let totalFiles = 0;

    // 1. Root retrospectives
    const retroPath = path.join(this.config.repoRoot, this.config.sourcePaths.retrospectives);
    if (fs.existsSync(retroPath)) {
      const files = this.getAllMarkdownFiles(retroPath);
      for (const filePath of files) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const relativePath = path.relative(this.config.repoRoot, filePath);
        const docs = this.parseRetroFile(relativePath, content);
        documents.push(...docs);
      }
      totalFiles += files.length;
    }

    // 2. Project-first vault dirs
    let skippedDupes = 0;
    const projectDirs = this.discoverProjectPsiDirs();
    for (const projectDir of projectDirs) {
      const projectRetros = path.join(projectDir, 'memory', 'retrospectives');
      if (!fs.existsSync(projectRetros)) continue;
      const files = this.getAllMarkdownFiles(projectRetros);
      for (const filePath of files) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const contentHash = Bun.hash(content).toString(36);
        if (this.seenContentHashes.has(contentHash)) {
          skippedDupes++;
          continue;
        }
        this.seenContentHashes.add(contentHash);
        const relativePath = path.relative(this.config.repoRoot, filePath);
        const docs = this.parseRetroFile(relativePath, content);
        documents.push(...docs);
      }
      totalFiles += files.length;
    }

    console.log(`Indexed ${documents.length} retrospective documents from ${totalFiles} files (skipped ${skippedDupes} duplicate files)`);
    return documents;
  }

  /**
   * Recursively get all markdown files
   */
  private getAllMarkdownFiles(dir: string): string[] {
    const files: string[] = [];
    const items = fs.readdirSync(dir);

    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        files.push(...this.getAllMarkdownFiles(fullPath));
      } else if (item.endsWith('.md')) {
        files.push(fullPath);
      }
    }

    return files;
  }

  /**
   * Parse retrospective markdown
   * Now reads frontmatter tags and inherits them to all chunks.
   * Falls back to path-based project inference for vault-nested files.
   */
  private parseRetroFile(relativePath: string, content: string): OracleDocument[] {
    const documents: OracleDocument[] = [];
    const now = Date.now();

    // Extract file-level tags from frontmatter
    const fileTags = this.parseFrontmatterTags(content);

    // Infer project from frontmatter or path
    const fileProject = this.parseFrontmatterProject(content)
      || this.inferProjectFromPath(relativePath);

    // Extract key sections (AI Diary, What I Learned, etc.)
    const sections = content.split(/^##\s+/m).filter(s => s.trim());

    sections.forEach((section, index) => {
      const lines = section.split('\n');
      const sectionTitle = lines[0].trim();
      const body = lines.slice(1).join('\n').trim();

      if (!body || body.length < 50) return; // Skip short sections

      const filename = path.basename(relativePath, '.md');
      const id = `retro_${filename}_${index}`;
      const extractedConcepts = this.extractConcepts(sectionTitle, body);

      documents.push({
        id,
        type: 'retro',
        source_file: relativePath,
        content: `${sectionTitle}: ${body}`,
        concepts: this.mergeConceptsWithTags(extractedConcepts, fileTags),
        created_at: now,
        updated_at: now,
        project: fileProject || undefined
      });
    });

    return documents;
  }

  /**
   * Parse frontmatter tags from markdown content
   * Supports: tags: [a, b, c] or tags: a, b, c
   */
  private parseFrontmatterTags(content: string): string[] {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) return [];

    const frontmatter = frontmatterMatch[1];

    // Match tags: [tag1, tag2] or tags: tag1, tag2
    const tagsMatch = frontmatter.match(/^tags:\s*\[?([^\]\n]+)\]?/m);
    if (!tagsMatch) return [];

    return tagsMatch[1]
      .split(',')
      .map(t => t.trim().toLowerCase())
      .filter(t => t.length > 0);
  }

  /**
   * Parse frontmatter project from markdown content
   * Returns the project field if found in frontmatter
   * Also extracts project from source field (e.g., "source: rrr: owner/repo")
   */
  private parseFrontmatterProject(content: string): string | null {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) return null;

    const frontmatter = frontmatterMatch[1];

    // First, try direct project: field
    const projectMatch = frontmatter.match(/^project:\s*(.+)$/m);
    if (projectMatch) {
      const project = projectMatch[1].trim();
      // Handle quoted values
      if ((project.startsWith('"') && project.endsWith('"')) ||
          (project.startsWith("'") && project.endsWith("'"))) {
        return project.slice(1, -1);
      }
      return project || null;
    }

    // Fallback: extract from source field (e.g., "source: rrr: owner/repo")
    const sourceMatch = frontmatter.match(/^source:\s*rrr:\s*(.+)$/m);
    if (sourceMatch) {
      const repo = sourceMatch[1].trim();
      // Convert owner/repo to github.com/owner/repo
      if (repo && repo.includes('/')) {
        return `github.com/${repo}`;
      }
    }

    // Fallback: known project patterns in source field
    const sourceField = frontmatter.match(/^source:\s*(.+)$/m);
    if (sourceField) {
      const source = sourceField[1].trim().toLowerCase();
      // Map known sources to projects
      if (source.includes('arthur oracle') || source.includes('arthur landing')) {
        return 'github.com/laris-co/arthur-oracle';
      }
    }

    return null;
  }

  /**
   * Extract concept tags from text
   * Combines keyword matching with optional file-level tags
   */
  private extractConcepts(...texts: string[]): string[] {
    const combined = texts.join(' ').toLowerCase();
    const concepts = new Set<string>();

    // Common Oracle concepts (expanded list)
    const keywords = [
      'trust', 'pattern', 'mirror', 'append', 'history', 'context',
      'delete', 'behavior', 'intention', 'decision', 'human', 'external',
      'brain', 'command', 'oracle', 'timestamp', 'immutable', 'preserve',
      // Additional keywords for better coverage
      'learn', 'memory', 'session', 'workflow', 'api', 'mcp', 'claude',
      'git', 'code', 'file', 'config', 'test', 'debug', 'error', 'fix',
      'feature', 'refactor', 'style', 'docs', 'plan', 'task', 'issue'
    ];

    for (const keyword of keywords) {
      if (combined.includes(keyword)) {
        concepts.add(keyword);
      }
    }

    return Array.from(concepts);
  }

  /**
   * Merge extracted concepts with file-level tags
   */
  private mergeConceptsWithTags(extracted: string[], fileTags: string[]): string[] {
    return [...new Set([...extracted, ...fileTags])];
  }

  /**
   * Store documents in SQLite + Chroma
   * Uses Drizzle for type-safe inserts and sets createdBy: 'indexer'
   */
  private async storeDocuments(documents: OracleDocument[]): Promise<void> {
    const now = Date.now();

    // Prepare FTS statement (raw SQL required for FTS5)
    const insertFts = this.sqlite.prepare(`
      INSERT OR REPLACE INTO oracle_fts (id, content, concepts)
      VALUES (?, ?, ?)
    `);

    // Prepare for Chroma
    const ids: string[] = [];
    const contents: string[] = [];
    const metadatas: any[] = [];

    // Wrap SQLite inserts in a transaction for performance + atomicity
    this.sqlite.exec('BEGIN');
    try {
      for (const doc of documents) {
        // SQLite metadata - use doc.project if available, fall back to repo project
        const docProject = (doc.project || this.project)?.toLowerCase();

        // Drizzle upsert with createdBy: 'indexer'
        this.db.insert(oracleDocuments)
          .values({
            id: doc.id,
            type: doc.type,
            sourceFile: doc.source_file,
            concepts: JSON.stringify(doc.concepts),
            createdAt: doc.created_at,
            updatedAt: doc.updated_at,
            indexedAt: now,
            project: docProject,
            createdBy: 'indexer',  // Mark as indexer-created
          })
          .onConflictDoUpdate({
            target: oracleDocuments.id,
            set: {
              type: doc.type,
              sourceFile: doc.source_file,
              concepts: JSON.stringify(doc.concepts),
              updatedAt: doc.updated_at,
              indexedAt: now,
              project: docProject,
              // Don't update createdBy - preserve original
            }
          })
          .run();

        // SQLite FTS (raw SQL required for FTS5)
        insertFts.run(
          doc.id,
          doc.content,
          doc.concepts.join(' ')
        );

        // Chroma vector (metadata must be primitives, not arrays)
        ids.push(doc.id);
        contents.push(doc.content);
        metadatas.push({
          type: doc.type,
          source_file: doc.source_file,
          concepts: doc.concepts.join(',')  // Convert array to string for ChromaDB
        });
      }
      this.sqlite.exec('COMMIT');
    } catch (e) {
      this.sqlite.exec('ROLLBACK');
      throw e;
    }

    // Batch insert to Chroma in chunks of 100 (skip if no client)
    if (!this.chromaClient) {
      console.log('Skipping Chroma indexing (SQLite-only mode)');
      return;
    }

    const BATCH_SIZE = 100;
    let chromaSuccess = true;

    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batchIds = ids.slice(i, i + BATCH_SIZE);
      const batchContents = contents.slice(i, i + BATCH_SIZE);
      const batchMetadatas = metadatas.slice(i, i + BATCH_SIZE);

      try {
        // Format as ChromaDocument array for MCP client
        const chromaDocs = batchIds.map((id, idx) => ({
          id,
          document: batchContents[idx],
          metadata: batchMetadatas[idx]
        }));
        await this.chromaClient.addDocuments(chromaDocs);
        console.log(`Chroma batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(ids.length / BATCH_SIZE)} stored`);
      } catch (error) {
        console.error(`Chroma batch failed:`, error);
        chromaSuccess = false;
      }
    }

    console.log(`Stored in SQLite${chromaSuccess ? ' + Chroma' : ' (Chroma failed)'}`);
  }

  /**
   * Close database connections
   */
  async close(): Promise<void> {
    this.sqlite.close();
    if (this.chromaClient) {
      await this.chromaClient.close();
    }
  }
}

/**
 * CLI for running indexer
 */
const isMain = import.meta.url.endsWith('indexer.ts') || import.meta.url.endsWith('indexer.js');
if (isMain) {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '/tmp';
  const oracleDataDir = process.env.ORACLE_DATA_DIR || path.join(homeDir, '.oracle');

  // Prefer vault repo for centralized indexing, fall back to local ψ/ detection
  const scriptDir = import.meta.dirname || path.dirname(new URL(import.meta.url).pathname);
  const projectRoot = path.resolve(scriptDir, '..');

  const vaultResult = getVaultPsiRoot();
  const vaultRoot = 'path' in vaultResult ? vaultResult.path : null;

  // Vault may have project-first layout (github.com/org/repo/ψ/) without a root ψ/
  const vaultHasContent = vaultRoot && (
    fs.existsSync(path.join(vaultRoot, 'ψ')) ||
    fs.existsSync(path.join(vaultRoot, 'github.com'))
  );
  const repoRoot = process.env.ORACLE_REPO_ROOT ||
    (vaultHasContent ? vaultRoot :
     fs.existsSync(path.join(projectRoot, 'ψ')) ? projectRoot : process.cwd());

  const config: IndexerConfig = {
    repoRoot,
    dbPath: process.env.ORACLE_DB_PATH || path.join(oracleDataDir, 'oracle.db'),
    chromaPath: path.join(homeDir, '.chromadb'),
    sourcePaths: {
      resonance: 'ψ/memory/resonance',
      learnings: 'ψ/memory/learnings',
      retrospectives: 'ψ/memory/retrospectives'
    }
  };

  const indexer = new OracleIndexer(config);

  indexer.index()
    .then(async () => {
      console.log('Indexing complete!');
      await indexer.close();
    })
    .catch(async err => {
      console.error('Indexing failed:', err);
      await indexer.close();
      process.exit(1);
    });
}
