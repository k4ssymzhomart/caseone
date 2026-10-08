// Excel sheets as plain data (pure, tested): files.ts turns them into a workbook. Numbers stay numbers (shares as
// fractions with a percent format), times stay text in Asia/Qostanay, so the file reads the same everywhere.

export type CellValue = string | number | null;

export interface SheetColumn {
  header: string;
  key: string;
  /** Characters. Default 16. */
  width?: number;
  /** Excel number format: '0', '0.0', '0%' … */
  numFmt?: string;
  wrap?: boolean;
}

export interface SheetSpec {
  name: string;
  /** Lines above the table: the report name, the period, the filter. The first is bold. */
  title?: string[];
  columns: SheetColumn[];
  rows: Record<string, CellValue>[];
}

/** A finite number or null (numeric columns may arrive as text from PostgREST). */
export function cellNumber(value: unknown, digits?: number): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  if (digits == null) return n;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
