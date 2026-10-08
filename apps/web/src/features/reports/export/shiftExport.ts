// The shift report as a PDF document and as Excel sheets (CLAUDE.md §14), pure: the page hands over the report of
// rpc shift_report, the overdue rows it shows, the AI summary when it has one, the period and filter lines.
import {
  formatDuration,
  formatInt,
  hhmm,
  reasonLabel,
  VERDICT_LABEL,
  VERDICTS,
  type ShiftReport,
  type ShiftSummary,
} from '@rota/shared';
import type { Content, TableCell } from 'pdfmake/interfaces';
import { t } from '@/lib/i18n';
import { hoursText, minutesText, num, shareText } from '../format';
import { dataTable, kpiGrid, paragraph, pdfDocument, PDF_COLOR, section } from './pdfKit';
import { cellNumber, type SheetSpec } from './sheets';

/** An overdue order as the report page lists it. */
export interface OverdueExportRow {
  number: number;
  equipment: string;
  area: string;
  assignee: string;
  status: string;
  /** Formatted deadline, Asia/Qostanay. */
  due: string;
  lateMin: number;
}

export interface ShiftExportInput {
  report: ShiftReport;
  overdue: readonly OverdueExportRow[];
  /** The AI summary shown on the page; null while it loads or when it failed. */
  summary: ShiftSummary | null;
  /** «Смена · День · 09.10 · с 08:00 до 20:00». */
  periodText: string;
  /** «Фильтр: …» or the no filter line. */
  filterText: string;
  generatedAt: Date;
}

const n = (v: unknown): number => num(v) ?? 0;

function rejectsTotal(r: ShiftReport): number {
  return r.rejected_reasons.reduce((s, x) => s + n(x.count), 0);
}

/** The PDF of /reports/shift: counts, times, the AI summary, then every table of the page. */
export function shiftReportPdf(input: ShiftExportInput) {
  const r = input.report;
  const c = r.counts;
  const content: Content[] = [];

  content.push(
    section(t('report.section.orders'), [
      kpiGrid([
        { label: t('report.kpi.issued'), value: formatInt(n(c.issued)) },
        { label: t('report.kpi.accepted'), value: formatInt(n(c.accepted)) },
        { label: t('report.kpi.done'), value: formatInt(n(c.done)) },
        { label: t('report.kpi.closed'), value: formatInt(n(c.closed)) },
        { label: t('report.kpi.overdue'), value: formatInt(n(c.overdue)), critical: n(c.overdue) > 0 },
        { label: t('report.kpi.rejected'), value: formatInt(n(c.rejected)) },
        { label: t('report.kpi.rework'), value: formatInt(n(c.rework)) },
        { label: t('export.kpi.active_now'), value: formatInt(n(c.active_now)) },
      ]),
    ]),
    section(
      t('report.section.time'),
      kpiGrid([
        { label: t('report.kpi.reaction'), value: minutesText(r.reaction_avg_min) },
        { label: t('report.kpi.execution'), value: minutesText(r.execution_avg_min) },
        { label: t('report.kpi.on_time'), value: shareText(r.on_time_share) },
        { label: t('report.kpi.downtime'), value: hoursText(r.downtime_hours) },
      ]),
    ),
  );

  if (input.summary) {
    const s = input.summary;
    content.push(
      section(t('report.summary.title'), [
        paragraph(s.summary),
        { text: t('report.summary.recs'), bold: true, margin: [0, 2, 0, 4] },
        { ol: [...s.recommendations], margin: [0, 0, 0, 4] },
        { text: summaryMeta(s), style: 'muted' },
      ]),
    );
  }

  content.push(
    section(
      t('report.workload.title'),
      dataTable(
        [t('report.workload.worker'), t('report.workload.busy'), t('report.workload.share')],
        r.workload.map((w) => [w.short_name, formatDuration(n(w.busy_min)), shareText(w.share)]),
        { align: ['left', 'right', 'right'], empty: t('report.workload.empty') },
      ),
    ),
    section(
      t('report.downtime.title'),
      dataTable(
        [t('report.downtime.equipment'), t('report.downtime.orders'), t('report.downtime.hours')],
        r.downtime.map((d) => [d.name, formatInt(n(d.orders)), hoursText(d.hours)]),
        { align: ['left', 'right', 'right'], empty: t('report.downtime.empty') },
      ),
    ),
    section(
      t('report.overdue.title'),
      dataTable(
        [
          t('report.overdue.number'),
          t('report.overdue.equipment'),
          t('report.overdue.assignee'),
          t('report.overdue.status'),
          t('report.overdue.due'),
          t('report.overdue.late'),
        ],
        input.overdue.map((o): TableCell[] => [
          `№${o.number}`,
          { stack: [o.equipment, { text: o.area, style: 'muted' }] },
          o.assignee,
          o.status,
          o.due,
          { text: formatDuration(o.lateMin), color: PDF_COLOR.critical, alignment: 'right' },
        ]),
        {
          widths: ['auto', '*', 'auto', 'auto', 'auto', 'auto'],
          align: ['left', 'left', 'left', 'left', 'left', 'right'],
          empty: t('report.overdue.empty'),
        },
      ),
    ),
    section(
      t('report.rejects.title'),
      dataTable(
        [t('report.rejects.reason'), t('report.rejects.count'), t('report.rejects.share')],
        r.rejected_reasons.map((x) => [
          reasonLabel(x.reason) || t('report.rejects.no_reason'),
          formatInt(n(x.count)),
          shareText(rejectsTotal(r) > 0 ? n(x.count) / rejectsTotal(r) : 0),
        ]),
        { align: ['left', 'right', 'right'], empty: t('report.rejects.empty') },
      ),
    ),
    section(t('report.verdicts.title'), verdictsBlock(r)),
    section(
      t('report.issues.title'),
      dataTable(
        [t('report.issues.code'), t('report.issues.name'), t('report.issues.count')],
        r.top_issues.map((x) => [x.code, x.name ?? '', formatInt(n(x.count))]),
        { widths: ['auto', '*', 'auto'], align: ['left', 'left', 'right'], empty: t('report.issues.empty') },
      ),
    ),
    section(
      t('report.top_equipment.title'),
      dataTable(
        [t('report.downtime.equipment'), t('report.top_equipment.count')],
        r.top_equipment.map((x) => [x.name, formatInt(n(x.count))]),
        { align: ['left', 'right'], empty: t('report.issues.empty') },
      ),
    ),
  );

  return pdfDocument({
    title: t('page.reports_shift'),
    eyebrow: input.periodText,
    lines: [input.filterText],
    generatedAt: input.generatedAt,
    content,
  });
}

function verdictsBlock(r: ShiftReport): Content {
  const rows = VERDICTS.map((v) => ({ v, count: n(r.verdicts[v]) }));
  const total = rows.reduce((s, x) => s + x.count, 0);
  if (total === 0) return { text: t('report.verdicts.empty'), style: 'muted' };
  return [
    dataTable(
      [t('export.col.verdict'), t('export.col.orders'), t('report.rejects.share')],
      rows.map((x) => [VERDICT_LABEL[x.v], formatInt(x.count), shareText(x.count / total)]),
      { align: ['left', 'right', 'right'], empty: t('report.verdicts.empty') },
    ),
    {
      text: t('report.verdicts.overrides', { n: formatInt(n(r.master_overrides)) }),
      style: 'muted',
      margin: [0, 4, 0, 0],
    },
  ];
}

/** «Модель claude-sonnet-5-5, 14:05» or the rules line. */
export function summaryMeta(s: ShiftSummary): string {
  if (s.source === 'llm' && s.model) {
    const time = s.generated_at && Number.isFinite(Date.parse(s.generated_at)) ? hhmm(s.generated_at) : '';
    return time
      ? t('report.summary.meta_llm', { model: s.model, time })
      : t('report.summary.meta_model', { model: s.model });
  }
  if (s.source === 'rules') return t('report.summary.meta_rules');
  return t('report.summary.meta_mock');
}

/** Every table of the page as Excel sheets, numbers as numbers. */
export function shiftReportSheets(input: ShiftExportInput): SheetSpec[] {
  const r = input.report;
  const c = r.counts;
  const title = [t('page.reports_shift'), input.periodText, input.filterText];
  const metric = (label: string, value: number | null, unit = '') => ({ label, value, unit });
  const summaryRows = [
    metric(t('report.kpi.issued'), n(c.issued)),
    metric(t('report.kpi.accepted'), n(c.accepted)),
    metric(t('report.kpi.done'), n(c.done)),
    metric(t('report.kpi.closed'), n(c.closed)),
    metric(t('report.kpi.overdue'), n(c.overdue)),
    metric(t('report.kpi.rejected'), n(c.rejected)),
    metric(t('report.kpi.rework'), n(c.rework)),
    metric(t('export.kpi.cancelled'), n(c.cancelled)),
    metric(t('export.kpi.active_now'), n(c.active_now)),
    metric(t('report.kpi.reaction'), cellNumber(r.reaction_avg_min, 1), t('export.unit.min')),
    metric(t('report.kpi.execution'), cellNumber(r.execution_avg_min, 1), t('export.unit.min')),
    metric(
      t('report.kpi.on_time'),
      r.on_time_share == null ? null : cellNumber(n(r.on_time_share) * 100, 1),
      '%',
    ),
    metric(t('report.kpi.downtime'), cellNumber(r.downtime_hours, 1), t('export.unit.h')),
    metric(t('export.kpi.overrides'), n(r.master_overrides)),
  ];
  const sheets: SheetSpec[] = [
    {
      name: t('export.sheet.summary'),
      title,
      columns: [
        { header: t('export.col.metric'), key: 'label', width: 34 },
        { header: t('export.col.value'), key: 'value', width: 12 },
        { header: t('export.col.unit'), key: 'unit', width: 8 },
      ],
      rows: summaryRows,
    },
  ];
  if (input.summary) {
    sheets.push({
      name: t('report.summary.title'),
      title,
      columns: [{ header: t('report.summary.title'), key: 'text', width: 110, wrap: true }],
      rows: [
        { text: input.summary.summary },
        ...input.summary.recommendations.map((rec, i) => ({ text: `${i + 1}. ${rec}` })),
        { text: summaryMeta(input.summary) },
      ],
    });
  }
  sheets.push(
    {
      name: t('export.sheet.workload'),
      title,
      columns: [
        { header: t('report.workload.worker'), key: 'name', width: 24 },
        { header: t('export.col.busy_min'), key: 'busy', width: 14, numFmt: '0' },
        { header: t('report.workload.share'), key: 'share', width: 12, numFmt: '0%' },
      ],
      rows: r.workload.map((w) => ({
        name: w.short_name,
        busy: cellNumber(w.busy_min, 0),
        share: cellNumber(w.share, 3),
      })),
    },
    {
      name: t('export.sheet.downtime'),
      title,
      columns: [
        { header: t('report.downtime.equipment'), key: 'name', width: 32 },
        { header: t('report.downtime.orders'), key: 'orders', width: 10, numFmt: '0' },
        { header: t('export.col.hours'), key: 'hours', width: 12, numFmt: '0.0' },
      ],
      rows: r.downtime.map((d) => ({
        name: d.name,
        orders: cellNumber(d.orders),
        hours: cellNumber(d.hours, 1),
      })),
    },
    {
      name: t('export.sheet.overdue'),
      title,
      columns: [
        { header: t('report.overdue.number'), key: 'number', width: 8, numFmt: '0' },
        { header: t('report.overdue.equipment'), key: 'equipment', width: 30 },
        { header: t('export.col.area'), key: 'area', width: 20 },
        { header: t('report.overdue.assignee'), key: 'assignee', width: 22 },
        { header: t('report.overdue.status'), key: 'status', width: 16 },
        { header: t('report.overdue.due'), key: 'due', width: 12 },
        { header: t('export.col.late_min'), key: 'late', width: 14, numFmt: '0' },
      ],
      rows: input.overdue.map((o) => ({
        number: o.number,
        equipment: o.equipment,
        area: o.area,
        assignee: o.assignee,
        status: o.status,
        due: o.due,
        late: Math.round(o.lateMin),
      })),
    },
    {
      name: t('export.sheet.rejects'),
      title,
      columns: [
        { header: t('report.rejects.reason'), key: 'reason', width: 26 },
        { header: t('report.rejects.count'), key: 'count', width: 10, numFmt: '0' },
      ],
      rows: r.rejected_reasons.map((x) => ({
        reason: reasonLabel(x.reason) || t('report.rejects.no_reason'),
        count: cellNumber(x.count),
      })),
    },
    {
      name: t('export.sheet.verdicts'),
      title,
      columns: [
        { header: t('export.col.verdict'), key: 'verdict', width: 26 },
        { header: t('export.col.orders'), key: 'count', width: 10, numFmt: '0' },
      ],
      rows: VERDICTS.map((v) => ({ verdict: VERDICT_LABEL[v], count: n(r.verdicts[v]) })),
    },
    {
      name: t('export.sheet.issues'),
      title,
      columns: [
        { header: t('report.issues.code'), key: 'code', width: 8 },
        { header: t('report.issues.name'), key: 'name', width: 44 },
        { header: t('report.issues.count'), key: 'count', width: 10, numFmt: '0' },
      ],
      rows: r.top_issues.map((x) => ({ code: x.code, name: x.name ?? '', count: cellNumber(x.count) })),
    },
    {
      name: t('export.sheet.equipment'),
      title,
      columns: [
        { header: t('report.downtime.equipment'), key: 'name', width: 32 },
        { header: t('report.top_equipment.count'), key: 'count', width: 14, numFmt: '0' },
      ],
      rows: r.top_equipment.map((x) => ({ name: x.name, count: cellNumber(x.count) })),
    },
  );
  return sheets;
}
