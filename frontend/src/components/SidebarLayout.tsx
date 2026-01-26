import { Link } from 'react-router-dom';
import styles from './SidebarLayout.module.css';

const TYPES = [
  { key: 'all', label: 'All' },
  { key: 'principle', label: 'Principles' },
  { key: 'learning', label: 'Learnings' },
  { key: 'retro', label: 'Retros' }
];

interface SidebarLayoutProps {
  children: React.ReactNode;
  activeType?: string;
  onTypeChange?: (type: string) => void;
}

export function SidebarLayout({ children, activeType = 'all', onTypeChange }: SidebarLayoutProps) {
  return (
    <div className={styles.container}>
      <aside className={styles.sidebar}>
        <h3 className={styles.sidebarTitle}>Filter by Type</h3>
        <div className={styles.filters}>
          {TYPES.map(t => (
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
                to={t.key === 'all' ? '/feed' : `/feed?type=${t.key}`}
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
