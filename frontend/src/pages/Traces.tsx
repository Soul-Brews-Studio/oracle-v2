import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styles from './Traces.module.css';

interface TraceSummary {
  traceId: string;
  query: string;
  depth: number;
  fileCount: number;
  commitCount: number;
  issueCount: number;
  status: 'raw' | 'reviewed' | 'distilled';
  hasAwakening: boolean;
  createdAt: number;
}

interface TraceDetail {
  traceId: string;
  query: string;
  queryType: string;
  foundFiles: Array<{ path: string; type?: string; confidence?: string; matchReason?: string }>;
  foundCommits: Array<{ hash: string; shortHash?: string; message: string; date?: string }>;
  foundIssues: Array<{ number: number; title: string; state?: string; url?: string }>;
  foundRetrospectives: string[];
  foundLearnings: string[];
  fileCount: number;
  commitCount: number;
  issueCount: number;
  depth: number;
  parentTraceId: string | null;
  childTraceIds: string[];
  status: string;
  awakening: string | null;
  createdAt: number;
}

interface TracesResponse {
  traces: TraceSummary[];
  total: number;
  hasMore: boolean;
}

export function Traces() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [selectedTrace, setSelectedTrace] = useState<TraceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (id) {
      loadTraceDetail(id);
    } else {
      loadTraces();
    }
  }, [id]);

  async function loadTraces() {
    setLoading(true);
    setSelectedTrace(null);
    try {
      const res = await fetch('/api/traces?limit=100');
      const data: TracesResponse = await res.json();
      setTraces(data.traces);
      setTotal(data.total);
    } catch (err) {
      console.error('Failed to load traces:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadTraceDetail(traceId: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/traces/${traceId}`);
      if (!res.ok) {
        navigate('/traces');
        return;
      }
      const data: TraceDetail = await res.json();
      setSelectedTrace(data);
    } catch (err) {
      console.error('Failed to load trace detail:', err);
      navigate('/traces');
    } finally {
      setLoading(false);
    }
  }

  // Group traces by date
  const grouped = traces.reduce((acc, t) => {
    const date = new Date(t.createdAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    if (!acc[date]) acc[date] = [];
    acc[date].push(t);
    return acc;
  }, {} as Record<string, TraceSummary[]>);

  function getStatusBadge(status: string, hasAwakening: boolean) {
    if (hasAwakening) return <span className={styles.badgeAwakening}>awakened</span>;
    switch (status) {
      case 'distilled': return <span className={styles.badgeDistilled}>distilled</span>;
      case 'reviewed': return <span className={styles.badgeReviewed}>reviewed</span>;
      default: return <span className={styles.badgeRaw}>raw</span>;
    }
  }

  function getDigPointsPreview(t: TraceSummary) {
    const parts: string[] = [];
    if (t.fileCount > 0) parts.push(`${t.fileCount} files`);
    if (t.commitCount > 0) parts.push(`${t.commitCount} commits`);
    if (t.issueCount > 0) parts.push(`${t.issueCount} issues`);
    return parts.length > 0 ? parts.join(' · ') : 'no dig points';
  }

  // Detail view
  if (selectedTrace) {
    const t = selectedTrace;
    const totalDigPoints = t.fileCount + t.commitCount + t.issueCount +
      t.foundRetrospectives.length + t.foundLearnings.length;

    return (
      <div className={styles.page}>
        <button onClick={() => navigate('/traces')} className={styles.backLink}>
          ← Back to Traces
        </button>

        <div className={styles.detailHeader}>
          <h1 className={styles.query}>"{t.query}"</h1>
          <div className={styles.detailMeta}>
            {getStatusBadge(t.status, !!t.awakening)}
            <span className={styles.queryType}>{t.queryType}</span>
            <span className={styles.timestamp}>
              {new Date(t.createdAt).toLocaleString()}
            </span>
          </div>
        </div>

        {t.awakening && (
          <div className={styles.awakening}>
            <h3>Awakening</h3>
            <p>{t.awakening}</p>
          </div>
        )}

        <div className={styles.digPointsSummary}>
          <span>{totalDigPoints} dig points found</span>
          {t.depth > 0 && <span className={styles.depth}>depth: {t.depth}</span>}
        </div>

        <div className={styles.digPoints}>
          {t.foundFiles.length > 0 && (
            <section className={styles.section}>
              <h3>Files ({t.foundFiles.length})</h3>
              <ul className={styles.fileList}>
                {t.foundFiles.map((f, i) => (
                  <li key={i} className={styles.fileItem}>
                    <span className={styles.filePath}>{f.path}</span>
                    {f.confidence && <span className={styles.confidence}>{f.confidence}</span>}
                    {f.matchReason && <span className={styles.matchReason}>{f.matchReason}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {t.foundCommits.length > 0 && (
            <section className={styles.section}>
              <h3>Commits ({t.foundCommits.length})</h3>
              <ul className={styles.commitList}>
                {t.foundCommits.map((c, i) => (
                  <li key={i} className={styles.commitItem}>
                    <code className={styles.commitHash}>{c.shortHash || c.hash.slice(0, 7)}</code>
                    <span className={styles.commitMessage}>{c.message}</span>
                    {c.date && <span className={styles.commitDate}>{c.date}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {t.foundIssues.length > 0 && (
            <section className={styles.section}>
              <h3>Issues ({t.foundIssues.length})</h3>
              <ul className={styles.issueList}>
                {t.foundIssues.map((issue, i) => (
                  <li key={i} className={styles.issueItem}>
                    <span className={`${styles.issueState} ${issue.state === 'open' ? styles.open : styles.closed}`}>
                      #{issue.number}
                    </span>
                    {issue.url ? (
                      <a href={issue.url} target="_blank" rel="noopener noreferrer" className={styles.issueTitle}>
                        {issue.title}
                      </a>
                    ) : (
                      <span className={styles.issueTitle}>{issue.title}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {t.foundRetrospectives.length > 0 && (
            <section className={styles.section}>
              <h3>Retrospectives ({t.foundRetrospectives.length})</h3>
              <ul className={styles.pathList}>
                {t.foundRetrospectives.map((path, i) => (
                  <li key={i}>{path}</li>
                ))}
              </ul>
            </section>
          )}

          {t.foundLearnings.length > 0 && (
            <section className={styles.section}>
              <h3>Learnings ({t.foundLearnings.length})</h3>
              <ul className={styles.pathList}>
                {t.foundLearnings.map((path, i) => (
                  <li key={i}>{path}</li>
                ))}
              </ul>
            </section>
          )}

          {totalDigPoints === 0 && (
            <div className={styles.noDigPoints}>
              No dig points recorded for this trace.
            </div>
          )}
        </div>

        {(t.parentTraceId || t.childTraceIds.length > 0) && (
          <div className={styles.traceChain}>
            <h3>Trace Chain</h3>
            {t.parentTraceId && (
              <button
                onClick={() => navigate(`/traces/${t.parentTraceId}`)}
                className={styles.chainLink}
              >
                ↑ Parent trace
              </button>
            )}
            {t.childTraceIds.map(childId => (
              <button
                key={childId}
                onClick={() => navigate(`/traces/${childId}`)}
                className={styles.chainLink}
              >
                ↓ Child: {childId.slice(0, 8)}...
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // List view
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Discovery Traces</h1>
      <p className={styles.subtitle}>
        Your discovery journeys — what you searched and found
        <span className={styles.philosophy}>"Trace → Dig → Distill → Awakening"</span>
      </p>

      {loading ? (
        <div className={styles.loading}>Loading traces...</div>
      ) : traces.length === 0 ? (
        <div className={styles.empty}>
          <p>No traces recorded yet.</p>
          <p className={styles.hint}>
            Use <code>/trace</code> or <code>oracle_trace()</code> to log discoveries.
          </p>
        </div>
      ) : (
        <>
          <div className={styles.stats}>
            <span>{total} trace{total !== 1 ? 's' : ''} logged</span>
          </div>

          <div className={styles.timeline}>
            {Object.entries(grouped).map(([date, items]) => (
              <div key={date} className={styles.dateGroup}>
                <h2 className={styles.date}>{date}</h2>
                <div className={styles.items}>
                  {items.map(t => (
                    <div
                      key={t.traceId}
                      className={styles.item}
                      onClick={() => navigate(`/traces/${t.traceId}`)}
                    >
                      <div className={styles.itemHeader}>
                        <span className={styles.queryText}>"{t.query}"</span>
                        {getStatusBadge(t.status, t.hasAwakening)}
                      </div>
                      <div className={styles.itemDigPoints}>
                        {getDigPointsPreview(t)}
                      </div>
                      <div className={styles.itemMeta}>
                        {t.depth > 0 && (
                          <span className={styles.depth}>depth {t.depth}</span>
                        )}
                        <span className={styles.time}>
                          {new Date(t.createdAt).toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
