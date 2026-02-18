import { Link } from 'react-router-dom';
import styles from './SidebarLayout.module.css';

const DEFAULT_TYPES = [
  { key: 'all', label: 'All' },
  { key: 'principle', label: 'Principles' },
  { key: 'learning', label: 'Learnings' },
  { key: 'retro', label: 'Retros' }
];

interface FilterItem {
  key: string;
  label: string;
}

interface SidebarLayoutProps {
  children: React.ReactNode;
  activeType?: string;
  onTypeChange?: (type: string) => void;
  filters?: FilterItem[];
  filterTitle?: string;
  linkBase?: string;
}

export function SidebarLayout({
  children,
  activeType = 'all',
  onTypeChange,
  filters = DEFAULT_TYPES,
  filterTitle = 'Filter by Type',
  linkBase = '/feed',
}: SidebarLayoutProps) {
  return (
    <div className={styles.container}>
      <aside className={styles.sidebar}>
        <h3 className={styles.sidebarTitle}>{filterTitle}</h3>
        <div className={styles.filters}>
          {filters.map(t => (
            onTypeChange ? (
              <button
                key={t.key}
                type="button"
                onClick={() => onTypeChange(t.key)}
                className={`${styles.filterBtn} ${activeType === t.key ? styles.active : ''}`}
              >
                {t.label}
              </button>
            ) : (
              <Link
                key={t.key}
                to={t.key === 'all' ? linkBase : `${linkBase}?type=${t.key}`}
                className={`${styles.filterBtn} ${activeType === t.key ? styles.active : ''}`}
              >
                {t.label}
              </Link>
            )
          ))}
        </div>
      </aside>
      <main className={styles.main}>
        {children}
      </main>
    </div>
  );
}
