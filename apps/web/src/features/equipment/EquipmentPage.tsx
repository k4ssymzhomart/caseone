// /equipment/:id (master, manager): the unit's history (CLAUDE.md §10b): every order newest first, repairs with
// fault codes and scores, total downtime (equipment.history: orders with equipment_stopped, created_at to done_at or
// cancelled_at or now), weekly orders over the last quarter, the most frequent faults. Linked from every order card.
import {
  ddmm,
  formatDateTime,
  formatDuration,
  formatInt,
  formatNumber,
  formatPercent,
  isActive,
  localParts,
  ORDER_TYPE_LABEL,
  PRIORITY_LABEL,
  priorityTone,
  startOfLocalDay,
  STATUS_LABEL,
  statusTone,
  isRotaError,
  type Directories,
  type EquipmentHistory,
  type OrderView,
} from '@rota/shared';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartCard, ChartTooltip } from '@/components/chart';
import { useDocumentTitle } from '@/components/layout';
import { Button } from '@/components/rota';
import {
  EmptyState,
  ErrorState,
  Grid,
  Kpi,
  Loading,
  Page,
  Pill,
  Section,
  Segmented,
  Table,
  Tag,
  type Column,
} from '@/components/ui';
import { gridProps, series, stackedBarProps, tooltipProps, xAxisProps, yAxisProps } from '@/lib/chart';
import { useRouteId } from '@/lib/params';
import { useDirectories, useEquipmentHistory } from '@/lib/queries';
import { paths } from '@/lib/routes';
import { useNow } from '@/lib/useNow';
import { t } from './strings';
import styles from './equipment.module.css';

const WEEKS = 13;
const PAGE = 50;
const DAY_MS = 86_400_000;

type View = 'all' | 'unplanned' | 'planned' | 'active';

export function EquipmentPage() {
  const id = useRouteId();
  const q = useEquipmentHistory(id);
  const dirs = useDirectories();
  const now = useNow(60_000);
  useDocumentTitle(q.data?.equipment.name);

  if (id == null) return <NotFound />;
  if (q.data) return <History history={q.data} dirs={dirs.data} now={now} />;
  if (q.isError) {
    if (isRotaError(q.error) && q.error.code === 'BAD_INPUT') return <NotFound />;
    return (
      <Page title={t('page.equipment')}>
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </Page>
    );
  }
  return (
    <Page title={t('page.equipment')}>
      <Loading />
    </Page>
  );
}

function NotFound() {
  const navigate = useNavigate();
  return (
    <Page title={t('page.equipment')}>
      <EmptyState
        mascot="oops"
        title={t('equipment.not_found_title')}
        text={t('equipment.not_found_text')}
        action={
          <Button variant="secondary" onClick={() => navigate(paths.board)}>
            {t('equipment.to_board')}
          </Button>
        }
      />
    </Page>
  );
}

// ---------------------------------------------------------------------------- numbers

/** Same rule as the total: created_at to done_at, else cancelled_at, else now; only orders that stopped the unit. */
function downtimeOf(o: OrderView, now: Date): number | null {
  if (!o.equipment_stopped) return null;
  const end = Date.parse(o.done_at ?? o.cancelled_at ?? '') || now.getTime();
  return Math.max(0, (end - Date.parse(o.created_at)) / 60_000);
}

/** A KPI tile value that fits one line: «45 мин», «1,3 ч», «128 ч». The exact duration goes in the hint. */
function downtimeValue(minutes: number): string {
  if (minutes < 60) return formatDuration(minutes);
  const hours = minutes / 60;
  return t('equipment.hours', { h: formatNumber(hours, hours >= 10 ? 0 : 1) });
}

/** Local Monday 00:00 of the week that contains `value`. */
function weekStart(value: Date | string): Date {
  const day = startOfLocalDay(value);
  const p = localParts(day);
  const dow = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  return new Date(day.getTime() - ((dow + 6) % 7) * DAY_MS);
}

interface WeekRow {
  label: string;
  from: number;
  planned: number;
  unplanned: number;
}

function weekly(orders: readonly OrderView[], now: Date): WeekRow[] {
  const last = weekStart(now).getTime();
  const rows: WeekRow[] = [];
  for (let i = WEEKS - 1; i >= 0; i--) {
    // a week is 7 local days; UTC+5 has no daylight saving, so 7 × 24 h is exact
    const from = last - i * 7 * DAY_MS;
    rows.push({ label: ddmm(new Date(from)), from, planned: 0, unplanned: 0 });
  }
  for (const o of orders) {
    const at = Date.parse(o.created_at);
    if (at < (rows[0]?.from ?? 0)) continue;
    const idx = Math.min(rows.length - 1, Math.floor((at - (rows[0]?.from ?? 0)) / (7 * DAY_MS)));
    const row = rows[idx];
    if (!row) continue;
    if (o.type === 'unplanned') row.unplanned += 1;
    else row.planned += 1;
  }
  return rows;
}

interface CodeRow {
  code: string;
  name: string;
  count: number;
  share: number;
  last: string;
}

function topCodes(orders: readonly OrderView[], dirs: Directories | undefined): CodeRow[] {
  const coded = orders.filter((o) => o.fault_code);
  const map = new Map<string, { count: number; last: string }>();
  for (const o of coded) {
    const code = o.fault_code as string;
    const at = o.done_at ?? o.created_at;
    const cur = map.get(code);
    if (!cur) map.set(code, { count: 1, last: at });
    else {
      cur.count += 1;
      if (Date.parse(at) > Date.parse(cur.last)) cur.last = at;
    }
  }
  return [...map.entries()]
    .map(([code, v]) => ({
      code,
      name: dirs?.fault_codes.find((f) => f.code === code)?.name ?? '',
      count: v.count,
      share: coded.length ? v.count / coded.length : 0,
      last: v.last,
    }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
    .slice(0, 5);
}

// ---------------------------------------------------------------------------- page

function History({ history, dirs, now }: { history: EquipmentHistory; dirs: Directories | undefined; now: Date }) {
  const navigate = useNavigate();
  const e = history.equipment;
  const orders = history.orders;
  const area = dirs?.areas.find((a) => a.id === e.area_id)?.name ?? '';
  const [view, setView] = useState<View>('all');
  const [limit, setLimit] = useState(PAGE);

  const stats = useMemo(() => {
    const monthAgo = now.getTime() - 30 * DAY_MS;
    const closed = orders.filter((o) => o.status === 'closed' && o.final_score != null);
    return {
      total: orders.length,
      unplanned: orders.filter((o) => o.type === 'unplanned').length,
      unplanned30: orders.filter((o) => o.type === 'unplanned' && Date.parse(o.created_at) >= monthAgo).length,
      active: orders.filter((o) => isActive(o.status) || o.status === 'rejected').length,
      repeats: orders.filter((o) => o.repeat_of_order_id != null).length,
      score: closed.length ? closed.reduce((s, o) => s + (o.final_score ?? 0), 0) / closed.length : null,
    };
  }, [orders, now]);
  const weeks = useMemo(() => weekly(orders, now), [orders, now]);
  const codes = useMemo(() => topCodes(orders, dirs), [orders, dirs]);

  const filtered = useMemo(
    () =>
      orders.filter((o) => {
        if (view === 'unplanned') return o.type === 'unplanned';
        if (view === 'planned') return o.type === 'planned';
        if (view === 'active') return isActive(o.status) || o.status === 'rejected';
        return true;
      }),
    [orders, view],
  );
  const visible = filtered.slice(0, limit);

  const eyebrow = [
    t('equipment.eyebrow', { area, type: e.type, criticality: e.criticality }),
    e.inventory_no ? t('equipment.inventory', { no: e.inventory_no }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const columns: Column<OrderView>[] = [
    { key: 'number', header: t('equipment.col.number'), mono: true, render: (o) => `№${o.number}`, width: 72 },
    { key: 'created', header: t('equipment.col.created'), mono: true, render: (o) => formatDateTime(o.created_at), width: 112 },
    {
      key: 'kind',
      header: t('equipment.col.kind'),
      render: (o) => (
        <Pill tone={priorityTone(o.priority)}>
          {o.priority === 'emergency' ? PRIORITY_LABEL.emergency : ORDER_TYPE_LABEL[o.type]}
        </Pill>
      ),
    },
    {
      key: 'description',
      header: t('equipment.col.description'),
      render: (o) => (
        <span className={styles.description}>
          {o.description}
          {o.repeat_of_order_id != null ? <Tag tone="critical">{t('equipment.repeat')}</Tag> : null}
        </span>
      ),
    },
    {
      key: 'code',
      header: t('equipment.col.code'),
      render: (o) => (o.fault_code ? <Tag>{o.fault_code}</Tag> : <span className={styles.dim}>·</span>),
    },
    { key: 'assignee', header: t('equipment.col.assignee'), render: (o) => o.assignee_short_name },
    {
      key: 'status',
      header: t('equipment.col.status'),
      render: (o) => <Pill tone={statusTone(o.status)}>{STATUS_LABEL[o.status]}</Pill>,
    },
    {
      key: 'score',
      header: t('equipment.col.score'),
      align: 'right',
      mono: true,
      render: (o) => {
        const s = o.final_score ?? o.ai_score;
        return s != null ? String(s) : <span className={styles.dim}>·</span>;
      },
    },
    {
      key: 'downtime',
      header: t('equipment.col.downtime'),
      align: 'right',
      mono: true,
      render: (o) => {
        const m = downtimeOf(o, now);
        return m != null ? formatDuration(m) : <span className={styles.dim}>·</span>;
      },
    },
  ];

  const codeColumns: Column<CodeRow>[] = [
    { key: 'code', header: t('equipment.codes.code'), render: (r) => <Tag>{r.code}</Tag>, width: 96 },
    { key: 'name', header: t('equipment.codes.name'), render: (r) => r.name },
    { key: 'count', header: t('equipment.codes.count'), align: 'right', mono: true, render: (r) => String(r.count) },
    { key: 'share', header: t('equipment.codes.share'), align: 'right', mono: true, render: (r) => formatPercent(r.share) },
    { key: 'last', header: t('equipment.codes.last'), align: 'right', mono: true, render: (r) => ddmm(r.last) },
  ];

  const legend = [
    { label: t('equipment.chart.planned'), color: series(0) },
    { label: t('equipment.chart.unplanned'), color: series(1) },
  ];

  return (
    <Page
      eyebrow={eyebrow}
      title={e.name}
      actions={
        <Pill tone={e.is_stopped ? 'critical' : 'free'}>{e.is_stopped ? t('equipment.stopped') : t('equipment.running')}</Pill>
      }
    >
      <Grid min={170}>
        <Kpi label={t('equipment.kpi.orders')} value={formatInt(stats.total)} hint={t('equipment.kpi.orders_hint')} />
        <Kpi
          label={t('equipment.kpi.unplanned')}
          value={formatInt(stats.unplanned)}
          hint={t('equipment.kpi.unplanned_hint', { n: stats.unplanned30 })}
        />
        <Kpi
          label={t('equipment.kpi.downtime')}
          value={downtimeValue(history.downtime_min)}
          hint={
            history.downtime_min >= 60
              ? t('equipment.kpi.downtime_hint_exact', { duration: formatDuration(history.downtime_min) })
              : t('equipment.kpi.downtime_hint')
          }
        />
        <Kpi
          label={t('equipment.kpi.active')}
          value={formatInt(stats.active)}
          hint={t('equipment.kpi.active_hint')}
          tone={e.is_stopped && stats.active > 0 ? 'critical' : 'default'}
        />
        <Kpi
          label={t('equipment.kpi.repeats')}
          value={formatInt(stats.repeats)}
          hint={t('equipment.kpi.repeats_hint')}
          tone={stats.repeats >= 3 ? 'critical' : 'default'}
        />
        <Kpi
          label={t('equipment.kpi.score')}
          value={stats.score != null ? formatNumber(stats.score, 0) : t('equipment.kpi.none')}
          hint={t('equipment.kpi.score_hint')}
        />
      </Grid>

      {orders.length === 0 ? (
        <EmptyState mascot="peek" title={t('equipment.empty_title')} text={t('equipment.empty_text')} />
      ) : (
        <>
          <div className={styles.split}>
            <ChartCard
              title={t('equipment.chart.title')}
              subtitle={t('equipment.chart.subtitle', { n: WEEKS })}
              legend={legend}
              height={240}
            >
              <BarChart data={weeks} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis {...xAxisProps} dataKey="label" />
                <YAxis {...yAxisProps} />
                <Tooltip
                  {...tooltipProps}
                  content={(p) => (
                    <ChartTooltip
                      {...p}
                      format={(v) => formatInt(v)}
                      formatLabel={(label) => t('equipment.chart.week', { day: String(label) })}
                      totalLabel={t('equipment.chart.total')}
                    />
                  )}
                />
                <Bar dataKey="planned" name={t('equipment.chart.planned')} {...stackedBarProps(0, 2)} />
                <Bar dataKey="unplanned" name={t('equipment.chart.unplanned')} {...stackedBarProps(1, 2)} />
              </BarChart>
            </ChartCard>

            <Section title={t('equipment.codes')}>
              <Table
                columns={codeColumns}
                rows={codes}
                rowKey={(r) => r.code}
                caption={t('equipment.codes')}
                empty={<p className={styles.dim}>{t('equipment.kpi.none')}</p>}
              />
            </Section>
          </div>

          <Section
            title={t('equipment.history')}
            aside={
              <Segmented
                label={t('equipment.filter')}
                value={view}
                onChange={(v) => {
                  setView(v);
                  setLimit(PAGE);
                }}
                options={[
                  { value: 'all', label: t('equipment.filter.all') },
                  { value: 'unplanned', label: t('equipment.filter.unplanned') },
                  { value: 'planned', label: t('equipment.filter.planned') },
                  { value: 'active', label: t('equipment.filter.active') },
                ]}
              />
            }
          >
            <Table
              columns={columns}
              rows={visible}
              rowKey={(o) => o.id}
              onRowClick={(o) => navigate(paths.order(o.id))}
              caption={t('equipment.history')}
              empty={<p className={styles.dim}>{t('equipment.empty_filtered')}</p>}
            />
            {filtered.length > visible.length ? (
              <div className={styles.more}>
                <Button variant="secondary" onClick={() => setLimit((n) => n + PAGE)}>
                  {t('equipment.more', { n: Math.min(PAGE, filtered.length - visible.length) })}
                </Button>
              </div>
            ) : null}
          </Section>
        </>
      )}
    </Page>
  );
}

