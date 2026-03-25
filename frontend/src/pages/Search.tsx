import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { search, getStats } from '../api/oracle';
import type { Document } from '../api/oracle';
import { LogCard } from '../components/LogCard';
import styles from './Search.module.css';

type SearchMode = 'hybrid' | 'fts' | 'vector';
type DocType = 'all' | 'principle' | 'learning' | 'retro';

const MODE_INFO: Record<SearchMode, { label: string; desc: string; color: string }> = {
  hybrid: { label: 'Hybrid', desc: 'Keyword + Semantic', color: '#a78bfa' },
  fts: { label: 'Keyword', desc: 'Full-text search', color: '#60a5fa' },
  vector: { label: 'Semantic', desc: 'Meaning-based', color: '#4ade80' },
};

const TYPE_INFO: Record<DocType, { label: string; color: string }> = {
  all: { label: 'All', color: '#888' },
  principle: { label: 'Principles', color: '#60a5fa' },
  learning: { label: 'Learnings', color: '#fbbf24' },
  retro: { label: 'Retros', color: '#4ade80' },
};

export function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [results, setResults] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [searched, setSearched] = useState(false);
  const [searchTime, setSearchTime] = useState<number | null>(null);
  const [searchWarning, setSearchWarning] = useState<string | null>(null);

  // Search controls
  const [mode, setMode] = useState<SearchMode>('hybrid');
  const [docType, setDocType] = useState<DocType>('all');
  const [vectorEnabled, setVectorEnabled] = useState<boolean | null>(null);

  // Check vector availability on mount
  useEffect(() => {
    getStats().then(stats => {
      setVectorEnabled(stats.vector?.enabled ?? false);
    }).catch(() => setVectorEnabled(false));
  }, []);

  useEffect(() => {
    const q = searchParams.get('q');
    if (q) {
      setQuery(q);
      doSearch(q);
    }
  }, [searchParams, mode, docType]);

  async function doSearch(q: string) {
    if (!q.trim()) return;

    setLoading(true);
    setSearched(true);
    setSearchWarning(null);
    const start = performance.now();
    try {
      const data = await search(q, docType, 50, mode);
      setResults(data.results);
      setTotal(data.total);
      setSearchTime(Math.round(performance.now() - start));
      if (data.warning) setSearchWarning(data.warning);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) {
      setSearchParams({ q: query });
    }
  }

  // Count results by source type
  const sourceCounts = results.reduce((acc, r) => {
    const src = r.source || 'unknown';
    acc[src] = (acc[src] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Search Oracle</h1>

      <form onSubmit={handleSubmit} className={styles.form}>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search for patterns, principles, learnings..."
          className={styles.input}
          autoFocus
        />
        <button type="submit" className={styles.button}>
          Search
        </button>
      </form>

      {/* Search Mode & Filters */}
      <div className={styles.controls}>
        <div className={styles.modeGroup}>
          <span className={styles.controlLabel}>Mode</span>
          <div className={styles.modeButtons}>
            {(Object.keys(MODE_INFO) as SearchMode[]).map(m => {
              const info = MODE_INFO[m];
              const disabled = (m === 'vector' || m === 'hybrid') && vectorEnabled === false;
              return (
                <button
                  key={m}
                  onClick={() => !disabled && setMode(m)}
                  disabled={disabled}
                  className={`${styles.modeBtn} ${mode === m ? styles.modeBtnActive : ''}`}
                  style={mode === m ? { borderColor: info.color, color: info.color, background: `${info.color}15` } : undefined}
                  title={disabled ? 'Vector search not available' : info.desc}
                >
                  {info.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.modeGroup}>
          <span className={styles.controlLabel}>Type</span>
          <div className={styles.modeButtons}>
            {(Object.keys(TYPE_INFO) as DocType[]).map(t => {
              const info = TYPE_INFO[t];
              return (
                <button
                  key={t}
                  onClick={() => setDocType(t)}
                  className={`${styles.modeBtn} ${docType === t ? styles.modeBtnActive : ''}`}
                  style={docType === t ? { borderColor: info.color, color: info.color, background: `${info.color}15` } : undefined}
                >
                  {info.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Vector status warning */}
      {vectorEnabled === false && (mode === 'hybrid' || mode === 'vector') && (
        <div className={styles.warning}>
          Vector search unavailable — falling back to keyword search.
        </div>
      )}

      {loading && <div className={styles.loading}>Searching...</div>}

      {!loading && searched && (
        <div className={styles.results}>
          <div className={styles.resultsMeta}>
            <p className={styles.meta}>
              {total} results for "{searchParams.get('q')}"
              {searchTime != null && <span className={styles.timing}> · {searchTime}ms</span>}
            </p>
            {/* Source breakdown */}
            {Object.keys(sourceCounts).length > 0 && (
              <div className={styles.sourceBreakdown}>
                {Object.entries(sourceCounts).map(([src, count]) => (
                  <span key={src} className={styles.sourceChip} data-source={src}>
                    {src.toUpperCase()} {count}
                  </span>
                ))}
              </div>
            )}
          </div>

          {searchWarning && (
            <div className={styles.warning}>{searchWarning}</div>
          )}

          {results.length > 0 ? (
            <div className={styles.list}>
              {results.map(doc => (
                <LogCard key={doc.id} doc={doc} showScore />
              ))}
            </div>
          ) : (
            <div className={styles.empty}>
              No results found. Try a different search term or change the search mode.
            </div>
          )}
        </div>
      )}

      {!searched && (
        <div className={styles.suggestions}>
          <p className={styles.suggestionsTitle}>Try searching for:</p>
          <div className={styles.suggestionList}>
            {['oracle philosophy', 'nothing is deleted', 'patterns', 'retrospective', 'awakening', 'form and formless'].map(term => (
              <button
                key={term}
                onClick={() => {
                  setQuery(term);
                  setSearchParams({ q: term });
                }}
                className={styles.suggestion}
              >
                {term}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
