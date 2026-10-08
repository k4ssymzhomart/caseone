// Building blocks of the PDF reports (pure, tested): the page with the Rota lockup, the title, the period line and a
// numbered footer; sections, tables and KPI tiles in the light Rota palette (paper is light whatever the theme).
// pdfmake's default Roboto carries Cyrillic; files.ts loads it on demand.
import { getTheme, lockupSymbolPath, lockupWordmarkPath } from '@rota/design';
import { formatDate, hhmm } from '@rota/shared';
import type {
  Content,
  CustomTableLayout,
  StyleDictionary,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces';
import { t } from '@/lib/i18n';

const light = getTheme('light');

export const PDF_COLOR = {
  ink: light.color.textPrimary,
  heading: light.color.textHeading,
  muted: light.color.textSecondary,
  line: light.color.borderDefault,
  fill: light.color.bgSubtle,
  paper: light.color.bgCanvas,
  brand: light.color.bgBrand,
  critical: light.status.critical,
  warning: light.status.warning,
  success: light.status.success,
} as const;

/** The Rota lockup (red mark, dark wordmark) as SVG for pdfmake. */
export function lockupSvg(): string {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 165 50" width="165" height="50">' +
    `<path d="${lockupSymbolPath}" fill="${PDF_COLOR.brand}"/>` +
    `<path d="${lockupWordmarkPath}" fill="${PDF_COLOR.ink}" fill-rule="evenodd" clip-rule="evenodd"/>` +
    '</svg>'
  );
}

const STYLES: StyleDictionary = {
  title: { fontSize: 18, bold: true, color: PDF_COLOR.heading },
  eyebrow: { fontSize: 8, color: PDF_COLOR.muted, characterSpacing: 0.6 },
  muted: { fontSize: 8.5, color: PDF_COLOR.muted },
  h2: { fontSize: 11.5, bold: true, color: PDF_COLOR.heading, margin: [0, 0, 0, 6] },
  th: { fontSize: 8, bold: true, color: PDF_COLOR.muted },
  kpiValue: { fontSize: 15, bold: true, color: PDF_COLOR.heading },
  kpiLabel: { fontSize: 8, color: PDF_COLOR.muted },
  footer: { fontSize: 7.5, color: PDF_COLOR.muted },
  body: { fontSize: 9.5, lineHeight: 1.35 },
};

export interface PdfPage {
  title: string;
  /** The period line under the title. */
  eyebrow: string;
  /** Extra muted lines: the filter, the order's equipment. */
  lines?: string[];
  generatedAt: Date;
  content: Content[];
}

/** An A4 page with the lockup, the title block and «Стр. N из M» in the footer. */
export function pdfDocument(page: PdfPage): TDocumentDefinitions {
  return {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 48],
    info: { title: page.title, author: 'Rota', creator: 'Rota', producer: 'Rota' },
    defaultStyle: { font: 'Roboto', fontSize: 9.5, color: PDF_COLOR.ink },
    styles: STYLES,
    footer: (currentPage: number, pageCount: number): Content => ({
      columns: [
        { text: t('export.footer'), style: 'footer' },
        {
          text: t('export.page', { n: currentPage, total: pageCount }),
          style: 'footer',
          alignment: 'right',
        },
      ],
      margin: [40, 16, 40, 0],
    }),
    content: [
      {
        columns: [
          { svg: lockupSvg(), width: 66 },
          {
            text: t('export.generated', { time: `${formatDate(page.generatedAt)} ${hhmm(page.generatedAt)}` }),
            style: 'muted',
            alignment: 'right',
          },
        ],
      },
      { text: page.title, style: 'title', margin: [0, 14, 0, 2] },
      { text: page.eyebrow.toUpperCase(), style: 'eyebrow', margin: [0, 0, 0, 2] },
      ...(page.lines ?? []).map((line): Content => ({ text: line, style: 'muted' })),
      ...page.content,
    ],
  };
}

/** A titled block; the heading stays with the first lines of its body. */
export function section(title: string, body: Content | Content[]): Content {
  return {
    stack: [{ text: title, style: 'h2' }, ...(Array.isArray(body) ? body : [body])],
    margin: [0, 16, 0, 0],
  };
}

export const TABLE_LAYOUT: CustomTableLayout = {
  hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0 : 0.5),
  vLineWidth: () => 0,
  hLineColor: () => PDF_COLOR.line,
  paddingLeft: (i) => (i === 0 ? 4 : 6),
  paddingRight: (i, node) => (i === (node.table.widths?.length ?? 1) - 1 ? 4 : 6),
  paddingTop: () => 4,
  paddingBottom: () => 4,
  fillColor: (row) => (row === 0 ? PDF_COLOR.fill : null),
};

export type Align = 'left' | 'right';

/** A table with a header row; a muted line instead when there are no rows. */
export function dataTable(
  headers: readonly string[],
  rows: readonly (readonly TableCell[])[],
  options: { widths?: (string | number)[]; align?: readonly Align[]; empty: string },
): Content {
  if (rows.length === 0) return { text: options.empty, style: 'muted' };
  const align = (i: number): Align => options.align?.[i] ?? 'left';
  return {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: options.widths ?? headers.map((_, i) => (i === 0 ? '*' : 'auto')),
      body: [
        headers.map((h, i): TableCell => ({ text: h, style: 'th', alignment: align(i) })),
        ...rows.map((r) =>
          r.map((cell, i): TableCell =>
            typeof cell === 'string' || typeof cell === 'number'
              ? { text: String(cell), alignment: align(i) }
              : cell,
          ),
        ),
      ],
    },
    layout: TABLE_LAYOUT,
  };
}

export interface Kpi {
  label: string;
  value: string;
  critical?: boolean;
}

/** KPI tiles, `columns` per row, on the subtle fill. */
export function kpiGrid(items: readonly Kpi[], columns = 4): Content {
  const cells: TableCell[] = items.map((k) => ({
    stack: [
      { text: k.value, style: 'kpiValue', color: k.critical ? PDF_COLOR.critical : PDF_COLOR.heading },
      { text: k.label, style: 'kpiLabel' },
    ],
    fillColor: PDF_COLOR.fill,
    margin: [6, 6, 6, 6],
  }));
  const body: TableCell[][] = [];
  for (let i = 0; i < cells.length; i += columns) {
    const row = cells.slice(i, i + columns);
    while (row.length < columns) row.push({ text: '' });
    body.push(row);
  }
  return {
    table: { widths: Array.from({ length: columns }, () => '*'), body },
    layout: {
      hLineWidth: () => 3,
      vLineWidth: () => 3,
      hLineColor: () => PDF_COLOR.paper,
      vLineColor: () => PDF_COLOR.paper,
    },
  };
}

/** A paragraph of body text. */
export function paragraph(text: string): Content {
  return { text, style: 'body', margin: [0, 0, 0, 6] };
}
