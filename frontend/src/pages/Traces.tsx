import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { SidebarLayout } from '../components/SidebarLayout';
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
  project: string | null;
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
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);

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

  async function toggleFilePreview(path: string, project: string | null) {
    if (expandedFile === path) {
      setExpandedFile(null);
      setFileContent(null);
      return;
    }

    setExpandedFile(path);
    setFileContent(null);
    setLoadingFile(true);

    try {
      // First try direct file read
      const params = new URLSearchParams({ path });
      if (project) params.set('project', project);
      const res = await fetch(`/api/file?${params}`);
      if (res.ok) {
        const text = await res.text();
        if (text && !text.startsWith('File not found')) {
          setFileContent(text);
          return;
        }
      }

      // Fallback: search Oracle docs by filename
      const filename = path.split('/').pop()?.replace('.md', '') || '';
      const searchRes = await fetch(`/api/search?q=${encodeURIComponent(filename)}&limit=1`);
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.docs?.[0]?.content) {
          setFileContent(searchData.docs[0].content);
          return;
        }
      }

      // Not found - show GitHub link if project available
      if (project) {
        const ghUrl = `https://${project}/blob/main/${path}`;
        setFileContent(`__GITHUB_LINK__${ghUrl}`);
      } else {
        setFileContent('File not found');
      }
    } catch {
      setFileContent('Failed to load file');
    } finally {
      setLoadingFile(false);
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
      <SidebarLayout>
        <button onClick={() => navigate('/traces')} className={styles.backLink}>
          ← Back to Traces
        </button>

        <div className={styles.detailHeader}>
          <h1 className={styles.query}>"{t.query}"</h1>
          <div className={styles.detailMeta}>
            {getStatusBadge(t.status, !!t.awakening)}
            <span className={styles.queryType}>{t.queryType}</span>
            {t.project && <span className={styles.project}>{t.project}</span>}
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
                  <li key={i} className={styles.fileEntry}>
                    <div
                      className={`${styles.fileItem} ${expandedFile === f.path ? styles.expanded : ''}`}
                      onClick={() => toggleFilePreview(f.path, t.project)}
                    >
                      <span className={styles.filePath}>{f.path}</span>
                      {f.confidence && <span className={styles.confidence}>{f.confidence}</span>}
                      {f.matchReason && <span className={styles.matchReason}>{f.matchReason}</span>}
                    </div>
                    {expandedFile === f.path && (
                      <div className={styles.filePreview}>
                        {loadingFile ? (
                          <div className={styles.previewLoading}>Loading...</div>
                        ) : fileContent?.startsWith('__GITHUB_LINK__') ? (
                          <div className={styles.githubLink}>
                            <span>File not found locally</span>
                            <a
                              href={fileContent.replace('__GITHUB_LINK__', '')}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.viewOnGithub}
                            >
                              View on GitHub →
                            </a>
                          </div>
                        ) : (
                          <pre className={styles.previewContent}>{fileContent}</pre>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {t.foundCommits.length > 0 && (
            <section className={styles.section}>
              <h3>Commits ({t.foundCommits.length})</h3>
              {t.project && (
                <div className={styles.commitRepo}>
                  {t.project}
                </div>
              )}
              <ul className={styles.commitList}>
                {t.foundCommits.map((c, i) => {
                  const commitUrl = t.project ? `https://${t.project}/commit/${c.hash}` : null;
                  const displayHash = c.shortHash || c.hash.slice(0, 7);
                  return (
                  <li key={i} className={styles.commitItem}>
                    {commitUrl ? (
                      <a href={commitUrl} target="_blank" rel="noopener noreferrer" className={styles.commitHash}>
                        {displayHash}
                      </a>
                    ) : (
                      <code className={styles.commitHash}>{displayHash}</code>
                    )}
                    <span className={styles.commitMessage}>{c.message}</span>
                    {c.date && <span className={styles.commitDate}>{c.date}</span>}
                  </li>
                  );
                })}
              </ul>
            </section>
          )}

          {t.foundIssues.length > 0 && (
            <section className={styles.section}>
              <h3>Issues ({t.foundIssues.length})</h3>
              {t.project && (
                <div className={styles.issueRepo}>
                  {t.project}
                </div>
              )}
              <ul className={styles.issueList}>
                {t.foundIssues.map((issue, i) => {
                  const issueUrl = issue.url || (t.project ? `https://${t.project}/issues/${issue.number}` : null);
                  return (
                  <li key={i} className={styles.issueItem}>
                    <span className={`${styles.issueState} ${issue.state === 'open' ? styles.open : styles.closed}`}>
                      #{issue.number}
                    </span>
                    {issueUrl ? (
                      <a href={issueUrl} target="_blank" rel="noopener noreferrer" className={styles.issueTitle}>
                        {issue.title}
                      </a>
                    ) : (
                      <span className={styles.issueTitle}>{issue.title}</span>
                    )}
                  </li>
                  );
                })}
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
      </SidebarLayout>
    );
  }

  // List view
  return (
    <SidebarLayout>
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
    </SidebarLayout>
  );
}
