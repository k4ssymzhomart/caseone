import type { ReactNode } from 'react';
import styles from './ui.module.css';

export interface Column<Row> {
  key: string;
  header: ReactNode;
  /** Cell content; default String(row[key]). */
  render?: (row: Row) => ReactNode;
  align?: 'left' | 'right' | 'center';
  /** Geist Mono with tabular digits: numbers, codes, times. */
  mono?: boolean;
  width?: number | string;
}

interface TableProps<Row> {
  columns: readonly Column<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string | number;
  onRowClick?: (row: Row) => void;
  /** Shown instead of the table when there are no rows. */
  empty?: ReactNode;
  caption?: string;
}

/** A dense report table on bgSubtle with hairlines; the header sticks while the page scrolls. */
export function Table<Row>({ columns, rows, rowKey, onRowClick, empty, caption }: TableProps<Row>) {
  if (rows.length === 0 && empty !== undefined) return <>{empty}</>;
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        {caption ? <caption className="visually-hidden">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} data-align={c.align} style={c.width != null ? { width: c.width } : undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              data-clickable={onRowClick ? true : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((c) => (
                <td key={c.key} data-align={c.align} data-mono={c.mono || undefined}>
                  {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
