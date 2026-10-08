// Components the report pages share (/reports/shift, /reports/rating, /dashboard, /analytics): a thin meter, a quiet
// «no data» line and the wrapper that dims the previous render while a new period loads. Helpers are in format.ts.
import type { ReactNode } from 'react';
import styles from './reports.module.css';

/** A thin bar for a share 0..1 next to its printed value (the value carries the meaning, the bar the shape). */
export function Meter({ share, label }: { share: number; label: ReactNode }) {
  const width = `${Math.max(0, Math.min(1, share)) * 100}%`;
  return (
    <span className={styles.meterCell}>
      <span className={styles.mono}>{label}</span>
      <span className={styles.meter} aria-hidden="true">
        <span className={styles.meterFill} style={{ width }} />
      </span>
    </span>
  );
}

/** A quiet line in place of an empty table. */
export function NoData({ children }: { children: ReactNode }) {
  return <p className={styles.noData}>{children}</p>;
}

/** Dims the previous render while the next period loads (keepPreviousData), so nothing jumps. */
export function Stale({ stale, children }: { stale: boolean; children: ReactNode }) {
  return (
    <div className={styles.stale} data-stale={stale || undefined} aria-busy={stale || undefined}>
      {children}
    </div>
  );
}
