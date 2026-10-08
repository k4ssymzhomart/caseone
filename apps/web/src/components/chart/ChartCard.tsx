// A chart on its card: title, optional subtitle, an HTML legend (text tokens, swatch beside it), then the plot in a
// ResponsiveContainer of a fixed height. Pass exactly one recharts chart element as children.
import type { ReactElement, ReactNode } from 'react';
import { ResponsiveContainer } from 'recharts';
import { CHART_HEIGHT } from '@/lib/chart';
import { ChartLegend, type LegendItem } from './ChartLegend';
import styles from './chart.module.css';

interface ChartCardProps {
  title: string;
  subtitle?: ReactNode;
  /** Required for two or more series; leave out for one (the title names it). */
  legend?: readonly LegendItem[];
  height?: number;
  /** Right side of the header: a Segmented switch, a link to the table. */
  aside?: ReactNode;
  children: ReactElement;
}

export function ChartCard({ title, subtitle, legend, height = CHART_HEIGHT, aside, children }: ChartCardProps) {
  return (
    <figure className={styles.card}>
      <figcaption className={styles.header}>
        <div className={styles.titles}>
          <span className={styles.title}>{title}</span>
          {subtitle ? <span className={styles.subtitle}>{subtitle}</span> : null}
        </div>
        {aside}
      </figcaption>
      {legend && legend.length > 1 ? <ChartLegend items={legend} /> : null}
      <div className={styles.plot} style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
