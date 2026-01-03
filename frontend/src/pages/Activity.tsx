import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getDashboardSummary, getDashboardActivity, getDashboardGrowth } from '../api/oracle';
import type { DashboardSummary, DashboardActivity, DashboardGrowth } from '../api/oracle';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import styles from './Activity.module.css';

const PERIODS = ['week', 'month', 'quarter'] as const;
type Period = typeof PERIODS[number];

const TABS = ['searches', 'consultations', 'learnings'] as const;
type Tab = typeof TABS[number];

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export function Activity() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [activity, setActivity] = useState<DashboardActivity | null>(null);
  const [growth, setGrowth] = useState<DashboardGrowth | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('searches');

  const period = (searchParams.get('period') as Period) || 'week';

  function setPeriod(newPeriod: Period) {
    setSearchParams({ period: newPeriod });
  }

  useEffect(() => {
    loadData();
  }, [period]);

  async function loadData() {
    setLoading(true);
    try {
      const days = period === 'week' ? 7 : period === 'month' ? 30 : 90;
      const [summaryData, activityData, growthData] = await Promise.all([
        getDashboardSummary(),
        getDashboardActivity(days),
        getDashboardGrowth(period)
      ]);
      setSummary(summaryData);
      setActivity(activityData);
      setGrowth(growthData);
    } finally {
      setLoading(false);
    }
  }

  // Calculate averages
  const avgSearchTime = activity?.searches.length
    ? Math.round(activity.searches.reduce((sum, s) => sum + s.search_time_ms, 0) / activity.searches.length)
    : 0;

  const avgMatches = activity?.consultations.length
    ? (activity.consultations.reduce((sum, c) => sum + c.principles_found + c.patterns_found, 0) / activity.consultations.length).toFixed(1)
    : '0';

  if (loading && !summary) {
    return <div className={styles.loading}>Loading activity data...</div>;
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Activity</h1>
        <p className={styles.subtitle}>Search logs, consultations, and learning history</p>
      </header>

      {/* Period Selector */}
      <div className={styles.periodSelector}>
        {PERIODS.map(p => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={`${styles.periodBtn} ${period === p ? styles.active : ''}`}
          >
            {p === 'week' ? '7 days' : p === 'month' ? '30 days' : '90 days'}
          </button>
        ))}
      </div>

      {/* Summary Cards */}
      <div className={styles.summaryGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>&#128269;</div>
          <div className={styles.statValue}>{summary?.activity.searches_7d ?? 0}</div>
          <div className={styles.statLabel}>Searches</div>
          <div className={styles.statMeta}>avg {avgSearchTime}ms</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>&#128172;</div>
          <div className={styles.statValue}>{summary?.activity.consultations_7d ?? 0}</div>
          <div className={styles.statLabel}>Consultations</div>
          <div className={styles.statMeta}>avg {avgMatches} matches</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>&#128218;</div>
          <div className={styles.statValue}>{summary?.activity.learnings_7d ?? 0}</div>
          <div className={styles.statLabel}>Learnings</div>
          <div className={styles.statMeta}>this period</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>&#127942;</div>
          <div className={styles.statValue}>{summary?.concepts.top[0]?.name ?? '-'}</div>
          <div className={styles.statLabel}>Top Concept</div>
          <div className={styles.statMeta}>{summary?.concepts.top[0]?.count ?? 0} docs</div>
        </div>
      </div>

      {/* Growth Chart */}
      {growth && growth.data.length > 0 && (
        <div className={styles.chartContainer}>
          <h2 className={styles.sectionTitle}>Daily Activity</h2>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={growth.data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="date"
                stroke="#666"
                fontSize={12}
                tickFormatter={(value) => {
                  const date = new Date(value);
                  return date.toLocaleDateString('en-US', { weekday: 'short' });
                }}
              />
              <YAxis stroke="#666" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1a1a2e',
                  border: '1px solid #2a2a3a',
                  borderRadius: '8px',
                  color: '#e0e0e0'
                }}
              />
              <Legend />
              <Line type="monotone" dataKey="searches" stroke="#a78bfa" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="consultations" stroke="#4ade80" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="documents" stroke="#fbbf24" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Activity Timeline */}
      <div className={styles.timeline}>
        <h2 className={styles.sectionTitle}>Recent Activity</h2>

        <div className={styles.tabs}>
          {TABS.map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`${styles.tabBtn} ${activeTab === tab ? styles.active : ''}`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              <span className={styles.tabCount}>
                {tab === 'searches' ? activity?.searches.length ?? 0 :
                 tab === 'consultations' ? activity?.consultations.length ?? 0 :
                 activity?.learnings.length ?? 0}
              </span>
            </button>
          ))}
        </div>

        <div className={styles.activityList}>
          {activeTab === 'searches' && activity?.searches.map((s, i) => (
            <div key={i} className={styles.activityItem}>
              <div className={styles.activityIcon}>&#128269;</div>
              <div className={styles.activityContent}>
                <div className={styles.activityTitle}>"{s.query}"</div>
                <div className={styles.activityMeta}>
                  {s.results_count} results &middot; {s.search_time_ms}ms &middot; {s.type}
                </div>
              </div>
              <div className={styles.activityTime}>{formatTimeAgo(s.created_at)}</div>
            </div>
          ))}

          {activeTab === 'consultations' && activity?.consultations.map((c, i) => (
            <div key={i} className={styles.activityItem}>
              <div className={styles.activityIcon}>&#128172;</div>
              <div className={styles.activityContent}>
                <div className={styles.activityTitle}>"{c.decision}"</div>
                <div className={styles.activityMeta}>
                  {c.principles_found} principles &middot; {c.patterns_found} patterns
                </div>
              </div>
              <div className={styles.activityTime}>{formatTimeAgo(c.created_at)}</div>
            </div>
          ))}

          {activeTab === 'learnings' && activity?.learnings.map((l, i) => (
            <div key={i} className={styles.activityItem}>
              <div className={styles.activityIcon}>&#128218;</div>
              <div className={styles.activityContent}>
                <div className={styles.activityTitle}>{l.pattern_preview}</div>
                <div className={styles.activityMeta}>
                  {l.concepts.join(', ') || 'No concepts'} &middot; {l.source}
                </div>
              </div>
              <div className={styles.activityTime}>{formatTimeAgo(l.created_at)}</div>
            </div>
          ))}

          {((activeTab === 'searches' && !activity?.searches.length) ||
            (activeTab === 'consultations' && !activity?.consultations.length) ||
            (activeTab === 'learnings' && !activity?.learnings.length)) && (
            <div className={styles.empty}>No {activeTab} in this period</div>
          )}
        </div>
      </div>
    </div>
  );
}
