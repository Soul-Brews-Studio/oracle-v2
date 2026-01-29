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
  parentTraceId?: string | null;
  prevTraceId?: string | null;
  nextTraceId?: string | null;
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
  prevTraceId: string | null;
  nextTraceId: string | null;
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
  const [linkedChain, setLinkedChain] = useState<TraceDetail[]>([]);
  const [chainPosition, setChainPosition] = useState(0);
  const [familyChain, setFamilyChain] = useState<TraceDetail[]>([]);
  const [familyPosition, setFamilyPosition] = useState(0);

  useEffect(() => {
    if (id) {
      loadTraceDetail(id);
      // Only reload linked chain if this trace isn't already in current chain
      const inCurrentChain = linkedChain.some(t => t.traceId === id);
      if (!inCurrentChain) {
        loadLinkedChain(id);
      } else {
        // Update position within existing chain
        const newPosition = linkedChain.findIndex(t => t.traceId === id);
        if (newPosition !== -1) setChainPosition(newPosition);
      }
      // Check family chain too
      const inFamilyChain = familyChain.some(t => t.traceId === id);
      if (!inFamilyChain) {
        loadFamilyChain(id);
      } else {
        const newFamilyPos = familyChain.findIndex(t => t.traceId === id);
        if (newFamilyPos !== -1) setFamilyPosition(newFamilyPos);
      }
    } else {
      loadTraces();
      setLinkedChain([]);
      setFamilyChain([]);
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

  async function loadLinkedChain(traceId: string) {
    try {
      const res = await fetch(`/api/traces/${traceId}/linked-chain`);
      if (res.ok) {
        const data = await res.json();
        setLinkedChain(data.chain || []);
        setChainPosition(data.position || 0);
      }
    } catch (err) {
      console.error('Failed to load linked chain:', err);
      setLinkedChain([]);
    }
  }

  async function loadFamilyChain(traceId: string) {
    try {
      // Fetch current trace to get parent/children info
      const res = await fetch(`/api/traces/${traceId}`);
      if (!res.ok) return;
      const current: TraceDetail = await res.json();

      const family: TraceDetail[] = [];
      let position = 0;

      // Fetch parent if exists
      if (current.parentTraceId) {
        const parentRes = await fetch(`/api/traces/${current.parentTraceId}`);
        if (parentRes.ok) {
          const parent: TraceDetail = await parentRes.json();
          family.push(parent);
          position = 1; // Current will be after parent
        }
      }

      // Add current
      family.push(current);

      // Fetch children
      if (current.childTraceIds && current.childTraceIds.length > 0) {
        for (const childId of current.childTraceIds) {
          const childRes = await fetch(`/api/traces/${childId}`);
          if (childRes.ok) {
            const child: TraceDetail = await childRes.json();
            family.push(child);
          }
        }
      }

      // Also check if current is a child and has siblings
      if (current.parentTraceId) {
        const parentRes = await fetch(`/api/traces/${current.parentTraceId}`);
        if (parentRes.ok) {
          const parent: TraceDetail = await parentRes.json();
          // Add siblings (other children of parent)
          for (const siblingId of parent.childTraceIds || []) {
            if (siblingId !== traceId && !family.some(f => f.traceId === siblingId)) {
              const sibRes = await fetch(`/api/traces/${siblingId}`);
              if (sibRes.ok) {
                const sibling: TraceDetail = await sibRes.json();
                family.push(sibling);
              }
            }
          }
        }
      }

      // Sort by createdAt
      family.sort((a, b) => a.createdAt - b.createdAt);
      const finalPosition = family.findIndex(f => f.traceId === traceId);

      setFamilyChain(family);
      setFamilyPosition(finalPosition >= 0 ? finalPosition : 0);
    } catch (err) {
      console.error('Failed to load family chain:', err);
      setFamilyChain([]);
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
        // Check if path looks like a repo reference (Org/repo format, no nested path)
        const isRepoRef = /^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(path);

        if (isRepoRef) {
          // Path is a repo reference - link to that repo directly
          const ghUrl = `https://github.com/${path}`;
          setFileContent(`__GITHUB_LINK__${ghUrl}`);
          return;
        }

        // Project may be "owner/repo" or "github.com/owner/repo"
        const ghProject = project.includes('github.com') ? project : `github.com/${project}`;
        const ghUrl = `https://${ghProject}/blob/main/${path}`;
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
        <div className={styles.navBar}>
          <button onClick={() => navigate('/traces')} className={styles.backLink}>
            ← Back to Traces
          </button>
          <div className={styles.chainNav}>
            {/* Use linked chain if available, otherwise use family chain */}
            {(() => {
              const chain = linkedChain.length > 1 ? linkedChain : familyChain;
              const position = linkedChain.length > 1 ? chainPosition : familyPosition;

              if (chain.length <= 1) return null;

              return (
                <>
                  {position > 0 ? (
                    <button
                      onClick={() => navigate(`/traces/${chain[0].traceId}`)}
                      className={styles.navButton}
                      title="First"
                    >
                      ⏮
                    </button>
                  ) : (
                    <span className={styles.navDisabled}>⏮</span>
                  )}
                  {position > 0 ? (
                    <button
                      onClick={() => navigate(`/traces/${chain[position - 1].traceId}`)}
                      className={styles.navButton}
                      title="Previous"
                    >
                      ←
                    </button>
                  ) : (
                    <span className={styles.navDisabled}>←</span>
                  )}
                  <div className={styles.chainNumbers}>
                    {chain.map((trace, i) => (
                      <button
                        key={trace.traceId}
                        onClick={() => navigate(`/traces/${trace.traceId}`)}
                        className={`${styles.chainNumber} ${i === position ? styles.currentNumber : ''}`}
                        title={trace.query}
                      >
                        {i + 1}
                      </button>
                    ))}
                  </div>
                  {position < chain.length - 1 ? (
                    <button
                      onClick={() => navigate(`/traces/${chain[position + 1].traceId}`)}
                      className={styles.navButton}
                      title="Next"
                    >
                      →
                    </button>
                  ) : (
                    <span className={styles.navDisabled}>→</span>
                  )}
                  {position < chain.length - 1 ? (
                    <button
                      onClick={() => navigate(`/traces/${chain[chain.length - 1].traceId}`)}
                      className={styles.navButton}
                      title="Last"
                    >
                      ⏭
                    </button>
                  ) : (
                    <span className={styles.navDisabled}>⏭</span>
                  )}
                </>
              );
            })()}
          </div>
        </div>

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

        {/* Linked Traces - Full Content */}
        {linkedChain.filter(trace => trace.traceId !== t.traceId).map((trace) => (
          <div key={trace.traceId} className={styles.linkedTrace}>
            <div className={styles.linkedTraceHeader}>
              <button
                className={styles.linkedTraceLabel}
                onClick={() => navigate(`/traces/${trace.traceId}`)}
              >
                {trace.traceId === t.prevTraceId ? '← Previous' : 'Next →'}
              </button>
              <h2 className={styles.linkedTraceQuery}>"{trace.query}"</h2>
              <div className={styles.linkedTraceMeta}>
                <span className={styles.queryType}>{trace.queryType}</span>
                {trace.project && <span className={styles.project}>{trace.project}</span>}
                <span className={styles.timestamp}>
                  {new Date(trace.createdAt).toLocaleString()}
                </span>
              </div>
            </div>

            <div className={styles.digPoints}>
              {trace.foundFiles?.length > 0 && (
                <section className={styles.section}>
                  <h3>Files ({trace.foundFiles.length})</h3>
                  <ul className={styles.fileList}>
                    {trace.foundFiles.map((f, i) => (
                      <li key={i} className={styles.fileEntry}>
                        <div className={styles.fileItem}>
                          <span className={styles.filePath}>{f.path}</span>
                          {f.confidence && <span className={styles.confidence}>{f.confidence}</span>}
                          {f.matchReason && <span className={styles.matchReason}>{f.matchReason}</span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {trace.foundCommits?.length > 0 && (
                <section className={styles.section}>
                  <h3>Commits ({trace.foundCommits.length})</h3>
                  {trace.project && <div className={styles.commitRepo}>{trace.project}</div>}
                  <ul className={styles.commitList}>
                    {trace.foundCommits.map((c, i) => {
                      const commitUrl = trace.project ? `https://${trace.project}/commit/${c.hash}` : null;
                      const displayHash = c.shortHash || c.hash?.slice(0, 7);
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

              {trace.foundIssues?.length > 0 && (
                <section className={styles.section}>
                  <h3>Issues ({trace.foundIssues.length})</h3>
                  {trace.project && <div className={styles.issueRepo}>{trace.project}</div>}
                  <ul className={styles.issueList}>
                    {trace.foundIssues.map((issue, i) => {
                      const issueUrl = issue.url || (trace.project ? `https://${trace.project}/issues/${issue.number}` : null);
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
            </div>
          </div>
        ))}

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
            {Object.entries(grouped).map(([date, items]) => {
              // Separate root traces and children
              const roots = items.filter(t => t.depth === 0 || !t.parentTraceId);
              const children = items.filter(t => t.depth > 0 && t.parentTraceId);

              // Build tree: each root with its children
              const tree = roots.map(root => ({
                root,
                children: children.filter(c => c.parentTraceId === root.traceId)
              }));

              // Add orphan children (parent not in this date group)
              const assignedChildren = new Set(tree.flatMap(t => t.children.map(c => c.traceId)));
              const orphans = children.filter(c => !assignedChildren.has(c.traceId));

              return (
                <div key={date} className={styles.dateGroup}>
                  <h2 className={styles.date}>{date}</h2>
                  <div className={styles.items}>
                    {tree.map(({ root, children }) => (
                      <div key={root.traceId} className={styles.traceFamily}>
                        {/* Parent trace */}
                        <div
                          className={styles.item}
                          onClick={() => navigate(`/traces/${root.traceId}`)}
                        >
                          <div className={styles.itemHeader}>
                            <span className={styles.queryText}>"{root.query}"</span>
                            {getStatusBadge(root.status, root.hasAwakening)}
                          </div>
                          <div className={styles.itemDigPoints}>
                            {getDigPointsPreview(root)}
                          </div>
                          <div className={styles.itemMeta}>
                            <code className={styles.traceId}>{root.traceId.slice(0, 8)}</code>
                            {(root.prevTraceId || root.nextTraceId) && (
                              <span className={styles.linkStatus}>
                                {root.prevTraceId && '←'}
                                {root.prevTraceId && root.nextTraceId ? ' linked ' : root.prevTraceId ? ' first' : ''}
                                {root.nextTraceId && '→'}
                                {!root.nextTraceId && root.prevTraceId && ' last'}
                              </span>
                            )}
                            <span className={styles.time}>
                              {new Date(root.createdAt).toLocaleTimeString('en-US', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                        </div>
                        {/* Children traces */}
                        {children.length > 0 && (
                          <div className={styles.childTraces}>
                            {children.map(child => (
                              <div
                                key={child.traceId}
                                className={`${styles.item} ${styles.childItem}`}
                                onClick={() => navigate(`/traces/${child.traceId}`)}
                              >
                                <div className={styles.itemHeader}>
                                  <span className={styles.childIndicator}>↳</span>
                                  <span className={styles.queryText}>"{child.query}"</span>
                                  {getStatusBadge(child.status, child.hasAwakening)}
                                </div>
                                <div className={styles.itemDigPoints}>
                                  {getDigPointsPreview(child)}
                                </div>
                                <div className={styles.itemMeta}>
                                  <code className={styles.traceId}>{child.traceId.slice(0, 8)}</code>
                                  <span className={styles.depth}>depth {child.depth}</span>
                                  {(child.prevTraceId || child.nextTraceId) && (
                                    <span className={styles.linkStatus}>
                                      {child.prevTraceId && '←'}
                                      {child.nextTraceId && '→'}
                                      {!child.nextTraceId && child.prevTraceId && ' last'}
                                    </span>
                                  )}
                                  <span className={styles.time}>
                                    {new Date(child.createdAt).toLocaleTimeString('en-US', {
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    {/* Orphan children (parent in different date) */}
                    {orphans.map(orphan => (
                      <div
                        key={orphan.traceId}
                        className={`${styles.item} ${styles.childItem}`}
                        onClick={() => navigate(`/traces/${orphan.traceId}`)}
                      >
                        <div className={styles.itemHeader}>
                          <span className={styles.childIndicator}>↳</span>
                          <span className={styles.queryText}>"{orphan.query}"</span>
                          {getStatusBadge(orphan.status, orphan.hasAwakening)}
                        </div>
                        <div className={styles.itemDigPoints}>
                          {getDigPointsPreview(orphan)}
                        </div>
                        <div className={styles.itemMeta}>
                          <span className={styles.depth}>depth {orphan.depth}</span>
                          <span className={styles.time}>
                            {new Date(orphan.createdAt).toLocaleTimeString('en-US', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </SidebarLayout>
  );
}
