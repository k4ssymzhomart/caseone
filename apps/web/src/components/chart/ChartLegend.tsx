import styles from './chart.module.css';

export interface LegendItem {
  label: string;
  /** series(i) or statusColor(tone) from lib/chart. */
  color: string;
}

/** Swatch plus label in the secondary text color; the label never wears the series color. */
export function ChartLegend({ items }: { items: readonly LegendItem[] }) {
  return (
    <ul className={styles.legend}>
      {items.map((item) => (
        <li key={item.label}>
          <span className={styles.swatch} style={{ background: item.color }} aria-hidden="true" />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
