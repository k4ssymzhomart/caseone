import { useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router';
import { apiMode, useRequiredSession } from '@/lib/api';
import { useRouteFilterConfig } from '@/lib/filters';
import { homeFor } from '@/lib/routes';
import { FilterBar } from '../FilterBar';
import { Lockup } from '../rota';
import { LiveStatus } from './LiveStatus';
import { ThemeToggle } from './ThemeToggle';
import { UserChip } from './UserChip';
import styles from './layout.module.css';

export function TopBar() {
  const session = useRequiredSession();
  const filter = useRouteFilterConfig();
  const ref = useRef<HTMLElement>(null);

  // The header grows when the filter row shows or wraps; the sticky sidebar and the HUD sit under its real height.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const apply = () => root.style.setProperty('--header-height', `${Math.round(el.getBoundingClientRect().height)}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty('--header-height');
    };
  }, []);

  return (
    <header ref={ref} className={styles.topbar}>
      <div className={styles.topRow}>
        <Link to={homeFor(session.role)} className={styles.brand} aria-label="Rota">
          <Lockup height={22} color="var(--color-text-primary)" />
        </Link>
        <div className={styles.topRight}>
          <LiveStatus mock={apiMode === 'mock'} />
          <ThemeToggle />
          <UserChip />
        </div>
      </div>
      {filter ? (
        <div className={styles.filterRow}>
          <FilterBar />
        </div>
      ) : null}
    </header>
  );
}
