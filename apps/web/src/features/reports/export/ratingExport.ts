// The rating of workers and brigades (CLAUDE.md §13) as Excel sheets and a PDF table, pure. Rows come from
// rpc rating as the page shows them; workers without closed orders stay in with their note and no score.
import { formatInt, RATING_COMPONENTS, RATING_WEIGHTS, type RatingRow } from '@rota/shared';
import type { TableCell } from 'pdfmake/interfaces';
import { t } from '@/lib/i18n';
import { num, scoreText, shareText } from '../format';
import { dataTable, paragraph, pdfDocument, section } from './pdfKit';
import { cellNumber, type SheetColumn, type SheetSpec } from './sheets';

export interface RatingExportInput {
  rows: readonly RatingRow[];
  /** brigade id → name, for the workers' brigade column. */
  brigadeNames: ReadonlyMap<number, string>;
  periodText: string;
  filterText: string;
  generatedAt: Date;
}

const scored = (r: RatingRow): boolean => num(r.score) != null;

/** Workers first by score (as rpc rating sorts them), the ones without closed orders last. */
function ordered(rows: readonly RatingRow[], kind: RatingRow['kind']): RatingRow[] {
  return rows
    .filter((r) => r.kind === kind)
    .slice()
    .sort((a, b) => {
      const sa = num(a.score);
      const sb = num(b.score);
      if (sa == null && sb == null) return a.name.localeCompare(b.name, 'ru');
      if (sa == null) return 1;
      if (sb == null) return -1;
      return sb - sa;
    });
}

function componentHeader(k: (typeof RATING_COMPONENTS)[number]): string {
  return `${k.toUpperCase()} ${t(`rating.${k}`)}, ${Math.round(RATING_WEIGHTS[k] * 100)}%`;
}

export function ratingSheets(input: RatingExportInput): SheetSpec[] {
  const title = [t('page.reports_rating'), input.periodText, input.filterText, t('rating.formula')];
  const components: SheetColumn[] = RATING_COMPONENTS.map((k) => ({
    header: componentHeader(k),
    key: k,
    width: 14,
    numFmt: '0.0%',
  }));
  const tail: SheetColumn[] = [
    { header: t('rating.col.score'), key: 'score', width: 10, numFmt: '0.0' },
    { header: t('export.col.note'), key: 'note', width: 24 },
  ];
  const row = (r: RatingRow, withBrigade: boolean) => ({
    rank: scored(r) ? r.rank : null,
    name: r.name,
    ...(withBrigade
      ? { brigade: r.brigade_id != null ? (input.brigadeNames.get(r.brigade_id) ?? '') : '' }
      : {}),
    closed: cellNumber(r.closed) ?? 0,
    q: cellNumber(r.q, 3),
    t: cellNumber(r.t, 3),
    f: cellNumber(r.f, 3),
    v: cellNumber(r.v, 3),
    d: cellNumber(r.d, 3),
    score: cellNumber(r.score, 1),
    note: scored(r) ? '' : (r.note ?? t('rating.no_closed')),
  });
  return [
    {
      name: t('rating.tab.workers'),
      title,
      columns: [
        { header: t('rating.col.rank'), key: 'rank', width: 8, numFmt: '0' },
        { header: t('rating.col.worker'), key: 'name', width: 22 },
        { header: t('rating.col.brigade'), key: 'brigade', width: 14 },
        { header: t('rating.col.closed'), key: 'closed', width: 10, numFmt: '0' },
        ...components,
        ...tail,
      ],
      rows: ordered(input.rows, 'worker').map((r) => row(r, true)),
    },
    {
      name: t('rating.tab.brigades'),
      title,
      columns: [
        { header: t('rating.col.rank'), key: 'rank', width: 8, numFmt: '0' },
        { header: t('rating.col.brigade'), key: 'name', width: 22 },
        { header: t('rating.col.closed'), key: 'closed', width: 10, numFmt: '0' },
        ...components,
        ...tail,
      ],
      rows: ordered(input.rows, 'brigade').map((r) => row(r, false)),
    },
  ];
}

export function ratingPdf(input: RatingExportInput) {
  const table = (kind: RatingRow['kind']) =>
    dataTable(
      [
        t('rating.col.rank'),
        kind === 'worker' ? t('rating.col.worker') : t('rating.col.brigade'),
        t('rating.col.closed'),
        ...RATING_COMPONENTS.map((k) => k.toUpperCase()),
        t('rating.col.score'),
      ],
      ordered(input.rows, kind).map((r): TableCell[] => [
        scored(r) ? String(r.rank) : '',
        kind === 'worker' && r.brigade_id != null
          ? { stack: [r.name, { text: input.brigadeNames.get(r.brigade_id) ?? '', style: 'muted' }] }
          : r.name,
        formatInt(num(r.closed) ?? 0),
        ...RATING_COMPONENTS.map((k) => (num(r[k]) == null ? '' : shareText(r[k]))),
        scored(r)
          ? { text: scoreText(r.score), bold: true, alignment: 'right' }
          : { text: r.note ?? t('rating.no_closed'), style: 'muted', alignment: 'right' },
      ]),
      {
        widths: ['auto', '*', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto'],
        align: ['left', 'left', 'right', 'right', 'right', 'right', 'right', 'right', 'right'],
        empty: t('rating.empty_text'),
      },
    );
  return pdfDocument({
    title: t('page.reports_rating'),
    eyebrow: input.periodText,
    lines: [input.filterText],
    generatedAt: input.generatedAt,
    content: [
      section(t('rating.tab.workers'), table('worker')),
      section(t('rating.tab.brigades'), table('brigade')),
      section(t('export.rating.legend'), [
        paragraph(RATING_COMPONENTS.map((k) => componentHeader(k)).join(' · ')),
        paragraph(t('rating.formula')),
      ]),
    ],
  });
}
