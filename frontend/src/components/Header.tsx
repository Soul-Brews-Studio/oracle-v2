import { Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import styles from './Header.module.css';

// Main nav items
const navItems = [
  { path: '/', label: 'Overview' },
  { path: '/feed', label: 'Feed' },
  { path: '/graph', label: 'Graph' },
  { divider: true },
  { path: '/search', label: 'Search' },
  { path: '/activity?tab=searches', label: 'Activity' },
  { divider: true },
  { path: '/forum', label: 'Forum' },
] as const;

// Dropdown items (Tools)
const toolsItems = [
  { path: '/consult', label: 'Consult' },
  { path: '/decisions', label: 'Decisions' },
  { path: '/evolution', label: 'Evolution' },
  { path: '/traces', label: 'Traces' },
  { path: '/superseded', label: 'Superseded' },
  { path: '/handoff', label: 'Handoff' },
] as const;

interface SessionStats {
  searches: number;
  consultations: number;
  learnings: number;
  startTime: number;
}

export function Header() {
  const location = useLocation();
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [sessionStartTime] = useState(() => {
    // Get or initialize session start time from localStorage
    const stored = localStorage.getItem('oracle_session_start');
    if (stored) return parseInt(stored);
    const now = Date.now();
    localStorage.setItem('oracle_session_start', String(now));
    return now;
  });

  useEffect(() => {
    loadSessionStats();
    // Refresh stats every 30 seconds from backend
    const interval = setInterval(loadSessionStats, 30000);
    return () => clearInterval(interval);
  }, [sessionStartTime]);

  async function loadSessionStats() {
    try {
      // Fetch real stats from backend (includes MCP usage)
      const response = await fetch(`/api/session/stats?since=${sessionStartTime}`);
      if (response.ok) {
        const data = await response.json();
        setSessionStats({
          searches: data.searches,
          consultations: data.consultations,
          learnings: data.learnings,
          startTime: sessionStartTime
        });
      }
    } catch (e) {
      console.error('Failed to load session stats:', e);
      // Fallback to zeros on error
      setSessionStats({
        searches: 0,
        consultations: 0,
        learnings: 0,
        startTime: sessionStartTime
      });
    }
  }

  function formatDuration(ms: number): string {
    const minutes = Math.floor(ms / 60000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }

  const duration = sessionStats
    ? formatDuration(Date.now() - sessionStats.startTime)
    : '0m';

  return (
    <header className={styles.header}>
      <Link to="/" className={styles.logo}>
        🔮 Oracle
        <span className={styles.version}>{__APP_VERSION__}</span>
      </Link>

      <nav className={styles.nav}>
        {navItems.map((item, i) =>
          'divider' in item ? (
            <span key={i} className={styles.divider} />
          ) : (
            <Link
              key={item.path}
              to={item.path}
              className={`${styles.navLink} ${location.pathname === item.path.split('?')[0] ? styles.active : ''}`}
            >
              {item.label}
            </Link>
          )
        )}
        <span className={styles.divider} />
        <div
          className={styles.dropdown}
          onMouseEnter={() => setToolsOpen(true)}
          onMouseLeave={() => setToolsOpen(false)}
        >
          <button
            type="button"
            className={`${styles.navLink} ${styles.dropdownTrigger} ${toolsItems.some(t => location.pathname === t.path) ? styles.active : ''}`}
          >
            Tools ▾
          </button>
          {toolsOpen && (
            <div className={styles.dropdownMenu}>
              {toolsItems.map(item => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`${styles.dropdownItem} ${location.pathname === item.path ? styles.active : ''}`}
                  onClick={() => setToolsOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </nav>

      <div className={styles.sessionStats}>
        <span className={styles.statItem}>
          Session: {duration}
        </span>
        <span className={styles.statItem}>
          {sessionStats?.searches || 0} searches
        </span>
        <span className={styles.statItem}>
          {sessionStats?.learnings || 0} learnings
        </span>
      </div>
    </header>
  );
}
