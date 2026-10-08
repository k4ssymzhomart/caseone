import type { ReactNode } from 'react';
import { Card } from './Card';
import styles from './ui.module.css';

interface KpiProps {
  /** Sentence case, no trailing colon: «Просрочено». */
  label: string;
  /** Already formatted (formatInt, formatDuration, formatPercent from @rota/shared); «—» is not allowed, use «0» or «нет данных». */
  value: ReactNode;
  hint?: ReactNode;
  /** 'critical' paints the value red when the number is bad (overdue > 0, units stopped). */
  tone?: 'default' | 'critical';
}

/** A stat tile: label, mono value, optional hint. Use in <Grid min={180}>. */
export function Kpi({ label, value, hint, tone = 'default' }: KpiProps) {
  return (
    <Card>
      <div className={styles.kpi} data-tone={tone === 'critical' ? 'critical' : undefined}>
        <span className={styles.kpiLabel}>{label}</span>
        <span className={styles.kpiValue}>{value}</span>
        {hint ? <span className={styles.kpiHint}>{hint}</span> : null}
      </div>
    </Card>
  );
}
