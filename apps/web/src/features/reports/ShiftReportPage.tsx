// /reports/shift (master, manager): the shift report of CLAUDE.md §14 on rpc shift_report with the shared FilterBar
// (top bar): KPI tiles, the AI summary (ai-shift-summary through api.ai.shiftSummary, the rules text from the same
// numbers when the model is off; «Обновить» asks again), tables for workload, downtime, overdue orders and
// rejections with reasons, AI verdicts and the most frequent faults. «Скачать PDF» and «Скачать Excel» export what
// the page shows (pdfmake and exceljs load on the first click).
// Overdue rows come from v_orders with the same rule as the report's overdue count: finished late inside the period,
// or still active with the deadline passed.
import {
  ACTIVE_STATUSES,
  formatDateTime,
  formatInt,
  isActive,
  reasonLabel,
  startOfLocalDay,
  STATUS_LABEL,
  statusTone,
  VERDICT_LABEL,
  VERDICTS,
  verdictTone,
  formatDuration,
  type OrderFilter,
  type OrderView,
  type ReportFilters,
  type ShiftReport,
  type ShiftSummary,
} from '@rota/shared';
import type { UseQueryResult } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, Mascot } from '@/components/rota';
import {
  Card,
  Grid,
  Kpi,
  Loading,
  ModelLabel,
  Page,
  Pill,
  QueryState,
  Section,
  Table,
  Tag,
  type Column,
} from '@/components/ui';
import { useReportFilter } from '@/lib/filters';
import { t } from '@/lib/i18n';
import { useDirectories, useOrders, useShiftReport, useShiftSummary } from '@/lib/queries';
import { paths } from '@/lib/routes';
import { useNow } from '@/lib/useNow';
import { downloadPdf, downloadXlsx, fileStamp } from './export/files';
import {
  shiftReportPdf,
  shiftReportSheets,
  summaryMeta,
  type OverdueExportRow,
  type ShiftExportInput,
} from './export/shiftExport';
import { ExportButton } from './export/ExportButton';
import { useExport } from './export/useExport';
import { filterText, hoursText, minutesText, num, periodEyebrow, shareText } from './format';
import { Meter, NoData, Stale } from './kit';
import s from './reports.module.css';

const DAY_MS = 86_400_000;

export function ShiftReportPage() {
  const { preset, period, filters, fromDay, toDay } = useReportFilter();
  const input = { ...period, filters };
  const report = useShiftReport(input);
  const dirs = useDirectories();
  const overdue = useOverdueRows(period.from, period.to, filters);
  const eyebrow = periodEyebrow(preset, period, fromDay, toDay);

  // the summary follows the preset and the filter, not the rolling minute; «Обновить» counts per scope
  const scopeKey = JSON.stringify([
    preset,
    preset === 'custom' ? [fromDay, toDay] : preset === 'shift' ? period.from : null,
    filters,
  ]);
  const [refresh, setRefresh] = useState<{ key: string; n: number }>({ key: scopeKey, n: 0 });
  const nonce = refresh.key === scopeKey ? refresh.n : 0;
  const summary = useShiftSummary(input, scopeKey, nonce);

  const exp = useExport();
  const exportInput = (r: ShiftReport): ShiftExportInput => ({
    report: r,
    overdue: overdue.rows.map(toExportRow),
    summary: summary.data ?? null,
    periodText: eyebrow,
    filterText: filterText(filters, dirs.data),
    generatedAt: new Date(),
  });
  const fileName = (ext: string) => `rota-shift-${fileStamp(period.from)}.${ext}`;
  const ready = !!report.data && !overdue.pending && exp.busy == null;

  return (
    <Page
      title={t('page.reports_shift')}
      eyebrow={eyebrow}
      actions={
        <>
          <ExportButton
            kind="pdf"
            busy={exp.busy === 'pdf'}
            disabled={!ready}
            onClick={() => {
              const r = report.data;
              if (r) void exp.run('pdf', () => downloadPdf(shiftReportPdf(exportInput(r)), fileName('pdf')));
            }}
          />
          <ExportButton
            kind="xlsx"
            busy={exp.busy === 'xlsx'}
            disabled={!ready}
            onClick={() => {
              const r = report.data;
              if (r) void exp.run('xlsx', () => downloadXlsx(shiftReportSheets(exportInput(r)), fileName('xlsx')));
            }}
          />
        </>
      }
    >
      <QueryState query={report}>
        {(r) => (
          <Stale stale={report.isPlaceholderData}>
            <Counts r={r} />
            <Timing r={r} />
            <Summary query={summary} onRefresh={() => setRefresh({ key: scopeKey, n: nonce + 1 })} />
            <div className={s.split}>
              <Workload r={r} />
              <Downtime r={r} />
            </div>
            <Overdue rows={overdue.rows} pending={overdue.pending} />
            <div className={s.split}>
              <Rejections r={r} />
              <Verdicts r={r} />
            </div>
            <div className={s.split}>
              <TopIssues r={r} />
              <TopEquipment r={r} />
            </div>
          </Stale>
        )}
      </QueryState>
    </Page>
  );
}

function Counts({ r }: { r: ShiftReport }) {
  const c = r.counts;
  const n = (v: unknown) => formatInt(num(v) ?? 0);
  return (
    <Section title={t('report.section.orders')}>
      <Grid min={150}>
        <Kpi
          label={t('report.kpi.issued')}
          value={n(c.issued)}
          hint={t('report.kpi.active_hint', { n: n(c.active_now) })}
        />
        <Kpi label={t('report.kpi.accepted')} value={n(c.accepted)} />
        <Kpi label={t('report.kpi.done')} value={n(c.done)} />
        <Kpi
          label={t('report.kpi.closed')}
          value={n(c.closed)}
          hint={t('report.kpi.cancelled_hint', { n: n(c.cancelled) })}
        />
        <Kpi
          label={t('report.kpi.overdue')}
          value={n(c.overdue)}
          tone={(num(c.overdue) ?? 0) > 0 ? 'critical' : 'default'}
        />
        <Kpi label={t('report.kpi.rejected')} value={n(c.rejected)} />
        <Kpi label={t('report.kpi.rework')} value={n(c.rework)} />
      </Grid>
    </Section>
  );
}

function Timing({ r }: { r: ShiftReport }) {
  return (
    <Section title={t('report.section.time')}>
      <div className={s.kpis4}>
        <Kpi
          label={t('report.kpi.reaction')}
          value={minutesText(r.reaction_avg_min)}
          hint={t('report.kpi.reaction_hint')}
        />
        <Kpi
          label={t('report.kpi.execution')}
          value={minutesText(r.execution_avg_min)}
          hint={t('report.kpi.execution_hint')}
        />
        <Kpi label={t('report.kpi.on_time')} value={shareText(r.on_time_share)} />
        <Kpi
          label={t('report.kpi.downtime')}
          value={hoursText(r.downtime_hours)}
          hint={t('report.kpi.downtime_hint')}
        />
      </div>
    </Section>
  );
}

/** The AI summary: the mascot reads while the model works, then the text, three recommendations and the source. */
function Summary({ query, onRefresh }: { query: UseQueryResult<ShiftSummary>; onRefresh: () => void }) {
  const busy = query.isFetching;
  const data = query.data;
  return (
    <Section
      title={t('report.summary.title')}
      aside={
        <Button variant="quiet" onClick={onRefresh} disabled={busy}>
          {busy && data ? t('report.summary.refreshing') : t('report.summary.refresh')}
        </Button>
      }
    >
      <Card pad="l">
        {data ? (
          <div className={s.summaryBody} aria-busy={busy || undefined} aria-live="polite">
            <p className={s.summaryLead}>{data.summary}</p>
            <span className={s.eyebrow}>{t('report.summary.recs')}</span>
            <ol className={s.recs}>
              {data.recommendations.map((rec, i) => (
                <li key={`${i}:${rec}`}>{rec}</li>
              ))}
            </ol>
            <p className={s.note}>
              <ModelLabel model={data.source === 'llm' ? data.model : null}>{summaryMeta(data)}</ModelLabel>
            </p>
          </div>
        ) : busy || query.isPending ? (
          <div className={s.summary} aria-busy="true">
            <Mascot name="read" size={96} />
            <div className={s.summaryText}>
              <span className={s.summaryTitle}>{t('report.summary.loading')}</span>
              <p className={s.note}>{t('report.summary.loading_text')}</p>
            </div>
          </div>
        ) : (
          <p className={s.note}>{t('report.summary.error')}</p>
        )}
      </Card>
    </Section>
  );
}

type WorkloadRow = ShiftReport['workload'][number];

function Workload({ r }: { r: ShiftReport }) {
  const columns: Column<WorkloadRow>[] = [
    { key: 'short_name', header: t('report.workload.worker') },
    {
      key: 'busy_min',
      header: t('report.workload.busy'),
      align: 'right',
      mono: true,
      render: (w) => formatDuration(num(w.busy_min) ?? 0),
    },
    {
      key: 'share',
      header: t('report.workload.share'),
      render: (w) => <Meter share={num(w.share) ?? 0} label={shareText(w.share)} />,
    },
  ];
  return (
    <Section title={t('report.workload.title')}>
      <Table
        columns={columns}
        rows={r.workload}
        rowKey={(w) => w.employee_id}
        empty={<NoData>{t('report.workload.empty')}</NoData>}
        caption={t('report.workload.title')}
      />
    </Section>
  );
}

type DowntimeRow = ShiftReport['downtime'][number];

function Downtime({ r }: { r: ShiftReport }) {
  const navigate = useNavigate();
  const columns: Column<DowntimeRow>[] = [
    {
      key: 'name',
      header: t('report.downtime.equipment'),
      render: (d) => (
        <Link
          className={s.link}
          to={paths.equipment(d.equipment_id)}
          onClick={(e) => e.stopPropagation()}
        >
          {d.name}
        </Link>
      ),
    },
    { key: 'orders', header: t('report.downtime.orders'), align: 'right', mono: true },
    {
      key: 'hours',
      header: t('report.downtime.hours'),
      align: 'right',
      mono: true,
      render: (d) => hoursText(d.hours),
    },
  ];
  return (
    <Section
      title={t('report.downtime.title')}
      aside={<span className={s.note}>{hoursText(r.downtime_hours)}</span>}
    >
      <Table
        columns={columns}
        rows={r.downtime}
        rowKey={(d) => d.equipment_id}
        onRowClick={(d) => navigate(paths.equipment(d.equipment_id))}
        empty={<NoData>{t('report.downtime.empty')}</NoData>}
        caption={t('report.downtime.title')}
      />
    </Section>
  );
}

interface OverdueRow {
  order: OverdueOrder;
  lateMin: number;
}

type OverdueOrder = Pick<
  OrderView,
  | 'id'
  | 'number'
  | 'status'
  | 'equipment_name'
  | 'area_name'
  | 'assignee_id'
  | 'assignee_short_name'
  | 'brigade_id'
  | 'brigade_name'
  | 'due_at'
  | 'done_at'
  | 'created_at'
>;

function assigneeText(o: OverdueOrder): string {
  return o.brigade_name ? `${o.assignee_short_name} · ${o.brigade_name}` : o.assignee_short_name;
}

function toExportRow({ order: o, lateMin }: OverdueRow): OverdueExportRow {
  return {
    number: o.number,
    equipment: o.equipment_name,
    area: o.area_name,
    assignee: assigneeText(o),
    status: STATUS_LABEL[o.status],
    due: formatDateTime(o.due_at),
    lateMin,
  };
}

/**
 * The report's overdue rule on v_orders: done inside the period after the deadline, or active with the deadline
 * passed (before the period end). Brigade follows the SQL: the order's brigade, else the assignee's.
 */
function useOverdueRows(
  from: string,
  to: string,
  filters: ReportFilters,
): { rows: OverdueRow[]; pending: boolean } {
  const now = useNow();
  const dirs = useDirectories();
  const base: OrderFilter = {};
  if (filters.area_id != null) base.area_id = filters.area_id;
  if (filters.equipment_id != null) base.equipment_id = filters.equipment_id;
  if (filters.assignee_id != null) base.assignee_id = filters.assignee_id;
  // finished orders: created up to two weeks before the period (norms are hours), from a local midnight so the
  // query key stays the same while a rolling period moves
  const since = startOfLocalDay(new Date(Date.parse(from) - 14 * DAY_MS)).toISOString();
  const active = useOrders({ ...base, statuses: [...ACTIVE_STATUSES] });
  const recent = useOrders({ ...base, since });

  const rows = useMemo<OverdueRow[]>(() => {
    const fromMs = Date.parse(from);
    const toMs = Date.parse(to);
    const nowMs = now.getTime();
    const limit = Math.min(toMs, nowMs);
    const brigadeOf = new Map((dirs.data?.employees ?? []).map((e) => [e.id, e.brigade_id]));
    const picked = new Map<number, OverdueRow>();
    for (const o of [...(active.data ?? []), ...(recent.data ?? [])]) {
      if (picked.has(o.id)) continue;
      if (
        filters.brigade_id != null &&
        (o.brigade_id ?? brigadeOf.get(o.assignee_id)) !== filters.brigade_id
      )
        continue;
      const due = Date.parse(o.due_at);
      const done = o.done_at ? Date.parse(o.done_at) : null;
      const lateDone = done != null && done >= fromMs && done < toMs && done > due;
      const lateActive = isActive(o.status) && due < limit && Date.parse(o.created_at) < toMs;
      if (!lateDone && !lateActive) continue;
      const lateMin = lateActive ? (nowMs - due) / 60_000 : ((done ?? due) - due) / 60_000;
      picked.set(o.id, { order: o, lateMin });
    }
    return [...picked.values()].sort((a, b) => b.lateMin - a.lateMin);
  }, [active.data, recent.data, dirs.data, filters.brigade_id, from, to, now]);

  return { rows, pending: active.isPending || recent.isPending };
}

function Overdue({ rows, pending }: { rows: OverdueRow[]; pending: boolean }) {
  const navigate = useNavigate();
  const columns: Column<OverdueRow>[] = [
    {
      key: 'number',
      header: t('report.overdue.number'),
      mono: true,
      render: ({ order: o }) => (
        <Link className={s.link} to={paths.order(o.id)} onClick={(e) => e.stopPropagation()}>
          №{o.number}
        </Link>
      ),
    },
    {
      key: 'equipment',
      header: t('report.overdue.equipment'),
      render: ({ order: o }) => (
        <span className={s.cellStack}>
          <span>{o.equipment_name}</span>
          <span className={s.cellSub}>{o.area_name}</span>
        </span>
      ),
    },
    {
      key: 'assignee',
      header: t('report.overdue.assignee'),
      render: ({ order: o }) => assigneeText(o),
    },
    {
      key: 'status',
      header: t('report.overdue.status'),
      render: ({ order: o }) => <Pill tone={statusTone(o.status)}>{STATUS_LABEL[o.status]}</Pill>,
    },
    {
      key: 'due',
      header: t('report.overdue.due'),
      mono: true,
      render: ({ order: o }) => formatDateTime(o.due_at),
    },
    {
      key: 'late',
      header: t('report.overdue.late'),
      align: 'right',
      mono: true,
      render: ({ lateMin }) => formatDuration(lateMin),
    },
  ];

  return (
    <Section
      title={t('report.overdue.title')}
      aside={pending ? null : <span className={s.note}>{formatInt(rows.length)}</span>}
    >
      {pending ? (
        <Loading />
      ) : (
        <Table
          columns={columns}
          rows={rows}
          rowKey={(row) => row.order.id}
          onRowClick={(row) => navigate(paths.order(row.order.id))}
          empty={<NoData>{t('report.overdue.empty')}</NoData>}
          caption={t('report.overdue.title')}
        />
      )}
    </Section>
  );
}

type RejectRow = ShiftReport['rejected_reasons'][number];

function Rejections({ r }: { r: ShiftReport }) {
  const total = r.rejected_reasons.reduce((sum, x) => sum + (num(x.count) ?? 0), 0);
  const columns: Column<RejectRow>[] = [
    {
      key: 'reason',
      header: t('report.rejects.reason'),
      render: (x) => reasonLabel(x.reason) || t('report.rejects.no_reason'),
    },
    { key: 'count', header: t('report.rejects.count'), align: 'right', mono: true },
    {
      key: 'share',
      header: t('report.rejects.share'),
      render: (x) => {
        const share = total > 0 ? (num(x.count) ?? 0) / total : 0;
        return <Meter share={share} label={shareText(share)} />;
      },
    },
  ];
  return (
    <Section
      title={t('report.rejects.title')}
      aside={<span className={s.note}>{formatInt(total)}</span>}
    >
      <Table
        columns={columns}
        rows={r.rejected_reasons}
        rowKey={(x) => x.reason ?? 'none'}
        empty={<NoData>{t('report.rejects.empty')}</NoData>}
        caption={t('report.rejects.title')}
      />
    </Section>
  );
}

function Verdicts({ r }: { r: ShiftReport }) {
  const rows = VERDICTS.map((v) => ({ verdict: v, count: num(r.verdicts[v]) ?? 0 }));
  const total = rows.reduce((sum, x) => sum + x.count, 0);
  const overrides = num(r.master_overrides) ?? 0;
  return (
    <Section
      title={t('report.verdicts.title')}
      aside={<span className={s.note}>{formatInt(total)}</span>}
    >
      {total === 0 ? (
        <NoData>{t('report.verdicts.empty')}</NoData>
      ) : (
        <Card>
          <div className={s.verdicts}>
            <div className={s.verdictBar} aria-hidden="true">
              {rows
                .filter((x) => x.count > 0)
                .map((x) => (
                  <span
                    key={x.verdict}
                    style={{
                      flexGrow: x.count,
                      background: `var(--status-${verdictTone(x.verdict)})`,
                    }}
                  />
                ))}
            </div>
            <div className={s.verdictRows}>
              {rows.map((x) => (
                <div key={x.verdict} className={s.verdictRow}>
                  <Pill tone={verdictTone(x.verdict)}>{VERDICT_LABEL[x.verdict]}</Pill>
                  <span className={s.mono}>{formatInt(x.count)}</span>
                  <span className={[s.mono, s.secondary].join(' ')}>
                    {shareText(x.count / total)}
                  </span>
                </div>
              ))}
            </div>
            <p className={s.note}>{t('report.verdicts.overrides', { n: formatInt(overrides) })}</p>
          </div>
        </Card>
      )}
    </Section>
  );
}

type IssueRow = ShiftReport['top_issues'][number];

function TopIssues({ r }: { r: ShiftReport }) {
  const columns: Column<IssueRow>[] = [
    { key: 'code', header: t('report.issues.code'), render: (x) => <Tag>{x.code}</Tag> },
    { key: 'name', header: t('report.issues.name'), render: (x) => x.name ?? '' },
    { key: 'count', header: t('report.issues.count'), align: 'right', mono: true },
  ];
  return (
    <Section title={t('report.issues.title')}>
      <Table
        columns={columns}
        rows={r.top_issues}
        rowKey={(x) => x.code}
        empty={<NoData>{t('report.issues.empty')}</NoData>}
        caption={t('report.issues.title')}
      />
    </Section>
  );
}

type TopEquipmentRow = ShiftReport['top_equipment'][number];

function TopEquipment({ r }: { r: ShiftReport }) {
  const navigate = useNavigate();
  const columns: Column<TopEquipmentRow>[] = [
    {
      key: 'name',
      header: t('report.downtime.equipment'),
      render: (x) => (
        <Link
          className={s.link}
          to={paths.equipment(x.equipment_id)}
          onClick={(e) => e.stopPropagation()}
        >
          {x.name}
        </Link>
      ),
    },
    { key: 'count', header: t('report.top_equipment.count'), align: 'right', mono: true },
  ];
  return (
    <Section title={t('report.top_equipment.title')}>
      <Table
        columns={columns}
        rows={r.top_equipment}
        rowKey={(x) => x.equipment_id}
        onRowClick={(x) => navigate(paths.equipment(x.equipment_id))}
        empty={<NoData>{t('report.issues.empty')}</NoData>}
        caption={t('report.top_equipment.title')}
      />
    </Section>
  );
}
