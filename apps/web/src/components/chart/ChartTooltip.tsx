import type { ReactNode } from 'react';
import styles from './chart.module.css';

/** The part of recharts' TooltipContentProps this uses, so `content={(p) => <ChartTooltip {...p} />}` type checks
 *  for any chart. */
interface Entry {
  name?: string | number;
  value?: unknown;
  color?: string;
  fill?: string;
  dataKey?: unknown;
}

type Props = {
  active?: boolean;
  payload?: readonly Entry[];
  label?: string | number;
  /** Value formatter, e.g. (v) => formatNumber(v) or formatDuration(v). Default: the number with a decimal comma. */
  format?: (value: number, name: string) => ReactNode;
  /** Label formatter for the hovered category. */
  formatLabel?: (label: string | number) => ReactNode;
  /** Adds a «Всего» row (stacked bars). */
  totalLabel?: string;
};

const defaultFormat = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',');

/** Tooltip content in the Rota look: elevated surface, hairline, swatch + name + value in text tokens. */
export function ChartTooltip({ active, payload, label, format = defaultFormat, formatLabel, totalLabel }: Props) {
  if (!active || !payload || payload.length === 0) return null;
  const rows = payload.filter((p) => typeof p.value === 'number');
  const total = rows.reduce((sum, p) => sum + (p.value as number), 0);
  return (
    <div className={styles.tooltip}>
      {label != null && label !== '' ? (
        <div className={styles.tooltipLabel}>{formatLabel ? formatLabel(label) : label}</div>
      ) : null}
      {rows.map((p) => (
        <div key={String(p.dataKey ?? p.name)} className={styles.tooltipRow}>
          <span className={styles.swatch} style={{ background: p.color ?? p.fill }} aria-hidden="true" />
          <span className={styles.tooltipName}>{String(p.name ?? p.dataKey ?? '')}</span>
          <span className={styles.tooltipValue}>{format(p.value as number, String(p.name ?? ''))}</span>
        </div>
      ))}
      {totalLabel && rows.length > 1 ? (
        <div className={[styles.tooltipRow, styles.tooltipTotal].join(' ')}>
          <span />
          <span className={styles.tooltipName}>{totalLabel}</span>
          <span className={styles.tooltipValue}>{format(total, totalLabel)}</span>
        </div>
      ) : null}
    </div>
  );
}
