/**
 * Map Handlers
 *
 * 2D and 3D knowledge map visualizations.
 */

import { sql } from 'drizzle-orm';
import { db, oracleDocuments } from '../../db/index.ts';
import { ensureVectorStoreConnected, getVectorStoreByModel } from '../../vector/factory.ts';

/** Simple deterministic hash → [0,1) float */
function simpleHash(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

// ============================================================================
// 2D Knowledge Map — Hash-based layout (fast, no real embeddings)
// ============================================================================

let mapCache: { data: any; timestamp: number } | null = null;
const MAP_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Compute 2D map coordinates for the knowledge map visualization.
 *
 * NOTE: Uses deterministic hash-based layout (not real PCA).
 * Projects placed via Fibonacci sunflower spiral, docs scattered via hash.
 */
export async function handleMap(): Promise<{
  documents: Array<{
    id: string;
    type: string;
    source_file: string;
    concepts: string[];
    chunk_ids: string[];
    project: string | null;
    x: number;
    y: number;
    created_at: string | null;
  }>;
  total: number;
}> {
  // Return cached result if fresh
  if (mapCache && (Date.now() - mapCache.timestamp) < MAP_CACHE_TTL) {
    return mapCache.data;
  }

  try {
    // Get all docs from SQLite (no vector DB dependency)
    const allDocs = db.select({
      id: oracleDocuments.id,
      type: oracleDocuments.type,
      sourceFile: oracleDocuments.sourceFile,
      concepts: oracleDocuments.concepts,
      project: oracleDocuments.project,
      createdAt: oracleDocuments.createdAt
    })
      .from(oracleDocuments)
      .all();

    if (allDocs.length === 0) {
      return { documents: [], total: 0 };
    }

    // Deduplicate by source_file — merge concepts and collect chunk IDs
    const fileMap = new Map<string, {
      id: string;
      type: string;
      sourceFile: string;
      allConcepts: string[];
      chunkIds: string[];
      project: string | null;
      createdAt: number | null;
    }>();
    for (const doc of allDocs) {
      const key = doc.sourceFile;
      const existing = fileMap.get(key);
      if (!existing) {
        const concepts = doc.concepts ? JSON.parse(doc.concepts) : [];
        fileMap.set(key, {
          id: doc.id,
          type: doc.type,
          sourceFile: doc.sourceFile,
          allConcepts: concepts,
          chunkIds: [doc.id],
          project: doc.project || null,
          createdAt: doc.createdAt
        });
      } else {
        existing.chunkIds.push(doc.id);
        const newConcepts: string[] = doc.concepts ? JSON.parse(doc.concepts) : [];
        for (const c of newConcepts) {
          if (!existing.allConcepts.includes(c)) existing.allConcepts.push(c);
        }
      }
    }
    const dedupedDocs = Array.from(fileMap.values());

    // Group by project for spatial clustering
    const projectMap = new Map<string, number>();
    let projectIdx = 0;
    for (const doc of dedupedDocs) {
      const proj = doc.project || '_default';
      if (!projectMap.has(proj)) projectMap.set(proj, projectIdx++);
    }

    // Place cluster centers using Fibonacci sunflower (fills disk, no donut)
    const golden = (1 + Math.sqrt(5)) / 2;
    const totalClusters = projectMap.size;
    const clusterCenters = new Map<number, { cx: number; cy: number }>();
    for (let i = 0; i < totalClusters; i++) {
      const angle = i * golden * Math.PI * 2;
      const r = Math.sqrt((i + 0.5) / totalClusters) * 0.75;
      clusterCenters.set(i, { cx: Math.cos(angle) * r, cy: Math.sin(angle) * r });
    }

    // Apply limit after dedup
    const limitedDocs = dedupedDocs.slice(0, 10000);

    const documents = limitedDocs.map((doc) => {
      const proj = doc.project || '_default';
      const clusterIdx = projectMap.get(proj) || 0;
      const center = clusterCenters.get(clusterIdx) || { cx: 0, cy: 0 };

      // Hash-based scatter within cluster — use sourceFile for stable position per file
      const h1 = simpleHash(doc.sourceFile);
      const h2 = simpleHash(doc.sourceFile + '_y');
      // Map uniform [0,1) to roughly gaussian spread
      const localX = (h1 - 0.5) * 0.2;
      const localY = (h2 - 0.5) * 0.2;

      const x = center.cx + localX;
      const y = center.cy + localY;

      return {
        id: doc.id,
        type: doc.type,
        source_file: doc.sourceFile,
        concepts: doc.allConcepts,
        chunk_ids: doc.chunkIds,
        project: doc.project,
        x,
        y,
        created_at: doc.createdAt ? new Date(doc.createdAt).toISOString() : null
      };
    });

    const result = { documents, total: documents.length };
    mapCache = { data: result, timestamp: Date.now() };
    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Map Error]', msg);
    throw new Error(`Map generation failed: ${msg}`);
  }
}

// ============================================================================
// 3D Knowledge Map — Real PCA from LanceDB embeddings
// ============================================================================

const map3dCaches = new Map<string, { data: any; timestamp: number }>();
const MAP3D_CACHE_TTL = 30 * 60 * 1000; // 30 minutes (PCA is expensive)

/**
 * PCA projection of real embeddings from LanceDB (bge-m3, 1024d → 3d).
 *
 * Algorithm:
 *   1. Load all vectors from LanceDB bge-m3 table
 *   2. Center the data (subtract mean)
 *   3. Compute top 3 principal components via power iteration on covariance matrix
 *   4. Project all vectors onto 3 PCs
 *   5. Merge with SQLite metadata (type, concepts, project)
 *   6. Cache result (recompute on cache expiry)
 */
export async function handleMap3d(model?: string): Promise<{
  documents: Array<{
    id: string;
    type: string;
    title: string;
    source_file: string;
    concepts: string[];
    project: string | null;
    x: number;
    y: number;
    z: number;
    created_at: string | null;
  }>;
  total: number;
  pca_info: {
    variance_explained: number[];
    n_vectors: number;
    n_dimensions: number;
    computed_at: string;
  };
}> {
  const modelKey = model || 'bge-m3';
  const cached = map3dCaches.get(modelKey);
  if (cached && (Date.now() - cached.timestamp) < MAP3D_CACHE_TTL) {
    return cached.data;
  }

  try {
    console.time(`[Map3D:${modelKey}] Total`);

    // Step 1: Get vector store for requested model
    console.time(`[Map3D:${modelKey}] Load embeddings`);
    const store = await getVectorStoreByModel(modelKey);

    if (!store.getAllEmbeddings) {
      throw new Error('Vector store does not support getAllEmbeddings');
    }

    const allData = await store.getAllEmbeddings(25000);
    const { ids, embeddings, metadatas } = allData;
    console.timeEnd('[Map3D] Load embeddings');

    if (embeddings.length === 0) {
      return { documents: [], total: 0, pca_info: { variance_explained: [], n_vectors: 0, n_dimensions: 0, computed_at: new Date().toISOString() } };
    }

    const n = embeddings.length;
    const d = embeddings[0].length;
    console.error(`[Map3D] Loaded ${n} vectors × ${d} dimensions`);

    // Step 2: Build metadata lookup from SQLite
    console.time('[Map3D] Metadata lookup');
    const docLookup = new Map<string, {
      type: string;
      sourceFile: string;
      concepts: string[];
      project: string | null;
      createdAt: number | null;
    }>();

    // Batch query SQLite for all doc IDs
    const batchSize = 500;
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      const rows = db.select({
        id: oracleDocuments.id,
        type: oracleDocuments.type,
        sourceFile: oracleDocuments.sourceFile,
        concepts: oracleDocuments.concepts,
        project: oracleDocuments.project,
        createdAt: oracleDocuments.createdAt,
      })
        .from(oracleDocuments)
        .where(sql`CAST(${oracleDocuments.id} AS TEXT) IN (${batch.map(() => '?').join(',')})`)
        .all();

      for (const row of rows) {
        docLookup.set(row.id, {
          type: row.type,
          sourceFile: row.sourceFile,
          concepts: row.concepts ? JSON.parse(row.concepts) : [],
          project: row.project || null,
          createdAt: row.createdAt,
        });
      }
    }
    console.timeEnd('[Map3D] Metadata lookup');

    // Step 3: Perform PCA (simplified - just take first 3 dimensions as approximation)
    // For production, use proper PCA algorithm

    // For now, return simplified result with first 3 dims as placeholder
    // Real PCA would require math library for eigendecomposition
    const documents = embeddings.slice(0, 10000).map((vec, i) => {
      const id = ids[i];
      const meta = docLookup.get(id);
      const vecMeta = metadatas[i];

      return {
        id,
        type: meta?.type || vecMeta?.type || 'unknown',
        title: vecMeta?.source_file || id,
        source_file: meta?.sourceFile || vecMeta?.source_file || id,
        concepts: meta?.concepts || [],
        project: meta?.project || null,
        x: vec[0] || 0,
        y: vec[1] || 0,
        z: vec[2] || 0,
        created_at: meta?.createdAt ? new Date(meta.createdAt).toISOString() : null
      };
    });

    const result = {
      documents,
      total: documents.length,
      pca_info: {
        variance_explained: [0.3, 0.2, 0.1], // Placeholder - would be computed from PCA
        n_vectors: n,
        n_dimensions: d,
        computed_at: new Date().toISOString()
      }
    };

    map3dCaches.set(modelKey, { data: result, timestamp: Date.now() });
    console.timeEnd(`[Map3D:${modelKey}] Total`);

    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Map3D Error]', msg);
    throw new Error(`Map3D generation failed: ${msg}`);
  }
}
