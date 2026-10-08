// /analytics (master, manager): insight cards (CLAUDE.md §15) for the FilterBar period and area: severity as a dot
// plus a word, the text, the recommendation and «Доказательства» (key numbers, the evidence orders as links to
// /orders/:id, a weekly mini chart, the unit's history). Cards come from rpc insight_cards now and from the LLM in
// Phase 6; the ask box stays disabled until then. The mascot «search» shows while the detectors run.
import {
  ddmm,
  formatCount,
  formatDate,
  formatInt,
  formatNumber,
  INSIGHT_FORMS,
  INSIGHT_KINDS,
  ORDER_FORMS,
  ruNum,
  SEVERITIES,
  type Insight,
  type InsightKind,
  type Severity,
  type Tone,
} from '@rota/shared';
import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartCard, ChartTooltip } from '@/components/chart';
import { Button } from '@/components/rota';
import {
  Card,
  EmptyState,
  ErrorState,
  Eyebrow,
  Field,
  Input,
  Loading,
  Page,
  Pill,
  Section,
  Tag,
} from '@/components/ui';
import {
  gridProps,
  series,
  stackedBarProps,
  tooltipProps,
  xAxisProps,
  yAxisProps,
} from '@/lib/chart';
import { useReportFilter } from '@/lib/filters';
import { t } from '@/lib/i18n';
import { useInsights } from '@/lib/queries';
import { paths } from '@/lib/routes';
import { num, periodEyebrow } from '@/features/reports/format';
import { Stale } from '@/features/reports/kit';
import rs from '@/features/reports/reports.module.css';
import styles from './analytics.module.css';
import { useEvidenceOrders, type EvidenceOrder } from './useEvidenceOrders';

const SEVERITY_TONE: Readonly<Record<Severity, Tone>> = {
  critical: 'critical',
  warning: 'warning',
  info: 'info',
};

export function AnalyticsPage() {
  const { preset, period, filters, fromDay, toDay } = useReportFilter();
  const insights = useInsights({ ...period, filters });
  // the evidence orders load once, when the first «Доказательства» opens
  const [evidenceWanted, setEvidenceWanted] = useState(false);
  const evidence = useEvidenceOrders(period, filters, evidenceWanted);

  return (
    <Page title={t('page.analytics')} eyebrow={periodEyebrow(preset, period, fromDay, toDay)}>
      <AskBox />
      {insights.data !== undefined ? (
        insights.data.length === 0 ? (
          <EmptyState
            mascot="peek"
            title={t('analytics.empty_title')}
            text={t('analytics.empty_text')}
          />
        ) : (
          <Stale stale={insights.isPlaceholderData}>
            <Section
              title={t('analytics.cards')}
              aside={
                <span className={rs.note}>{formatCount(insights.data.length, INSIGHT_FORMS)}</span>
              }
            >
              <div className={styles.cards}>
                {insights.data.map((card, i) => (
                  <InsightCard
                    key={`${card.kind}:${card.id ?? i}:${card.title}`}
                    card={card}
                    orders={evidence.data}
                    ordersPending={evidence.isPending}
                    onOpen={() => setEvidenceWanted(true)}
                  />
                ))}
              </div>
            </Section>
          </Stale>
        )
      ) : insights.isError ? (
        <ErrorState error={insights.error} onRetry={() => void insights.refetch()} />
      ) : (
        <EmptyState
          mascot="search"
          title={t('analytics.loading_title')}
          text={t('analytics.loading_text')}
        />
      )}
    </Page>
  );
}

/** The question box of Phase 6 (Haiku parses the question into a period, an area and a focus). Disabled for now. */
function AskBox() {
  return (
    <Card pad="l">
      <form className={styles.ask} onSubmit={(e) => e.preventDefault()}>
        <div className={styles.askRow}>
          <Field label={t('analytics.ask.label')}>
            {(id) => (
              <Input id={id} type="text" placeholder={t('analytics.ask.placeholder')} disabled />
            )}
          </Field>
          <Button type="submit" disabled>
            {t('analytics.ask.submit')}
          </Button>
        </div>
        <p className={rs.note}>{t('analytics.ask.soon')}</p>
      </form>
    </Card>
  );
}

interface InsightCardProps {
  card: Insight;
  orders: Map<number, EvidenceOrder> | undefined;
  ordersPending: boolean;
  onOpen: () => void;
}

function InsightCard({ card, orders, ordersPending, onOpen }: InsightCardProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const ids = useMemo(() => orderIds(card), [card]);
  // Phase 6 cards come from the LLM: an unknown severity reads as info rather than a raw key
  const severity: Severity = SEVERITIES.includes(card.severity) ? card.severity : 'info';
  return (
    <Card pad="l">
      <article className={styles.card}>
        <div className={styles.cardTop}>
          <Pill tone={SEVERITY_TONE[severity]}>{t(`analytics.severity.${severity}`)}</Pill>
          <Tag>{kindLabel(card.kind)}</Tag>
        </div>
        <h3 className={styles.cardTitle}>{card.title}</h3>
        <p className={styles.cardBody}>{card.body}</p>
        {card.recommendation ? (
          <div className={styles.recommendation}>
            <Eyebrow>{t('analytics.recommendation')}</Eyebrow>
            <span>{card.recommendation}</span>
          </div>
        ) : null}
        <Button
          variant="secondary"
          className={styles.toggle}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => {
            if (!open) onOpen();
            setOpen(!open);
          }}
        >
          {open
            ? t('analytics.evidence_hide')
            : t('analytics.evidence_count', { orders: formatCount(ids.length, ORDER_FORMS) })}
        </Button>
        {open ? (
          <div id={panelId} className={styles.evidence}>
            <Evidence card={card} ids={ids} orders={orders} pending={ordersPending} />
          </div>
        ) : null}
      </article>
    </Card>
  );
}

/** The card's kind in words; a kind this build does not know shows as it is. */
function kindLabel(kind: string): string {
  return (INSIGHT_KINDS as readonly string[]).includes(kind)
    ? t(`analytics.kind.${kind as InsightKind}`)
    : kind;
}

/** evidence.order_ids as numbers (jsonb may hold numbers or numeric strings), without duplicates. */
function orderIds(card: Insight): number[] {
  const raw: unknown = card.evidence?.order_ids;
  if (!Array.isArray(raw)) return [];
  const out = new Set<number>();
  for (const v of raw) {
    const n = num(v);
    if (n != null) out.add(n);
  }
  return [...out];
}

const LINKS_SHOWN = 24;

function Evidence({
  card,
  ids,
  orders,
  pending,
}: {
  card: Insight;
  ids: number[];
  orders: Map<number, EvidenceOrder> | undefined;
  pending: boolean;
}) {
  const [all, setAll] = useState(false);
  const stats = card.evidence?.stats ?? {};
  const equipmentId = num(stats.equipment_id);
  const facts = useMemo(() => statFacts(stats), [stats]);

  const found = useMemo(() => {
    if (!orders) return [];
    return ids
      .map((id) => orders.get(id))
      .filter((o): o is EvidenceOrder => o != null)
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  }, [ids, orders]);
  const missing = orders ? ids.length - found.length : 0;
  const shown = all ? found : found.slice(0, LINKS_SHOWN);

  return (
    <>
      {facts.length > 0 ? (
        <dl className={styles.facts}>
          {facts.map((f) => (
            <div key={f.label} className={styles.fact}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className={styles.block}>
        <Eyebrow>{t('analytics.evidence.orders')}</Eyebrow>
        {ids.length === 0 ? (
          <p className={rs.note}>{t('analytics.evidence.empty')}</p>
        ) : pending && !orders ? (
          <Loading />
        ) : (
          <>
            {shown.length > 0 ? (
              <ul className={styles.orderLinks}>
                {shown.map((o) => (
                  <li key={o.id}>
                    <Link
                      className={styles.orderLink}
                      to={paths.order(o.id)}
                      title={`${formatDate(o.created_at)} · ${o.equipment_name} · ${o.description}`}
                    >
                      №{o.number}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className={rs.inline}>
              {found.length > LINKS_SHOWN ? (
                <Button variant="quiet" onClick={() => setAll(!all)}>
                  {all
                    ? t('analytics.evidence.less')
                    : t('analytics.evidence.more', { n: formatInt(found.length) })}
                </Button>
              ) : null}
              {missing > 0 ? (
                <span className={rs.note}>
                  {t('analytics.evidence.missing', { orders: formatCount(missing, ORDER_FORMS) })}
                </span>
              ) : null}
            </div>
          </>
        )}
      </div>

      {found.length > 0 ? <WeeklyChart orders={found} /> : null}

      {equipmentId != null ? (
        <Link
          className={[rs.link, styles.equipmentLink].join(' ')}
          to={paths.equipment(equipmentId)}
        >
          {t('analytics.evidence.equipment')}
        </Link>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// key numbers from evidence.stats
// ---------------------------------------------------------------------------

const STAT_KEYS = [
  'unplanned',
  'downtime_h',
  'ratio_to_median',
  'count',
  'median_days_between',
  'workers',
  'planned',
  'followed_by_failure',
  'unit_base',
  'lift',
  'night',
  'day',
  'night_to_day',
  'repairs',
  'repeat_share',
  'team_share',
  'rework_share',
  'orders',
  'avg_qty',
  'reference_qty',
  'ratio',
  'slope_per_week',
] as const;
type StatKey = (typeof STAT_KEYS)[number];

const PERCENT: ReadonlySet<StatKey> = new Set([
  'followed_by_failure',
  'unit_base',
  'repeat_share',
  'team_share',
  'rework_share',
]);
const INTEGER: ReadonlySet<StatKey> = new Set([
  'unplanned',
  'count',
  'workers',
  'planned',
  'night',
  'day',
  'repairs',
  'orders',
]);
const QTY: ReadonlySet<StatKey> = new Set(['avg_qty', 'reference_qty']);

interface Fact {
  label: string;
  value: string;
}

function statFacts(stats: Record<string, unknown>): Fact[] {
  const facts: Fact[] = [];
  const unit = typeof stats.unit === 'string' ? stats.unit : '';
  for (const key of STAT_KEYS) {
    const v = num(stats[key]);
    if (v == null) continue;
    let value: string;
    if (PERCENT.has(key)) value = `${formatNumber(v * 100, 0)}%`;
    else if (INTEGER.has(key)) value = formatInt(v);
    else if (key === 'downtime_h') value = t('report.hours', { value: formatNumber(v) });
    else if (QTY.has(key)) value = unit ? `${ruNum(v)} ${unit}` : ruNum(v);
    else value = formatNumber(v);
    facts.push({ label: t(`analytics.stat.${key}`), value });
  }
  if (typeof stats.peak_from === 'string' && typeof stats.peak_to === 'string') {
    facts.push({
      label: t('analytics.stat.peak'),
      value: t('analytics.stat.peak_value', { from: stats.peak_from, to: stats.peak_to }),
    });
  }
  return facts;
}

// ---------------------------------------------------------------------------
// the weekly mini chart of the evidence orders
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const OFFSET_MS = 5 * 3_600_000; // Asia/Qostanay, UTC+5 all year

/** Start (UTC instant) of the local Monday week that contains `ms`. */
function weekStart(ms: number): number {
  const days = Math.floor((ms + OFFSET_MS) / DAY_MS);
  const monday = days - ((days + 3) % 7); // 1970-01-01 was a Thursday
  return monday * DAY_MS - OFFSET_MS;
}

/** Stacked weekly counts, unplanned in slot 1 and planned in slot 2 whatever the card shows. */
function WeeklyChart({ orders }: { orders: EvidenceOrder[] }) {
  const data = useMemo(() => {
    const weeks = new Map<number, { unplanned: number; planned: number }>();
    for (const o of orders) {
      const w = weekStart(Date.parse(o.created_at));
      const bucket = weeks.get(w) ?? { unplanned: 0, planned: 0 };
      bucket[o.type] += 1;
      weeks.set(w, bucket);
    }
    const keys = [...weeks.keys()];
    if (keys.length === 0) return [];
    const first = Math.min(...keys);
    const last = Math.max(...keys);
    const rows: { week: string; unplanned: number; planned: number }[] = [];
    for (let w = first; w <= last; w += 7 * DAY_MS) {
      const b = weeks.get(w) ?? { unplanned: 0, planned: 0 };
      rows.push({ week: ddmm(w), ...b });
    }
    return rows;
  }, [orders]);

  // one bar is not a chart: the links above already say it
  if (data.length < 2) return null;
  const parts = [
    { key: 'unplanned', label: t('analytics.evidence.unplanned') },
    { key: 'planned', label: t('analytics.evidence.planned') },
  ] as const;
  return (
    <div className={styles.chart}>
      <ChartCard
        title={t('analytics.evidence.chart')}
        subtitle={t('analytics.evidence.chart_hint')}
        legend={parts.map((p, i) => ({ label: p.label, color: series(i) }))}
        height={160}
      >
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis {...xAxisProps} dataKey="week" />
          <YAxis {...yAxisProps} width={32} />
          <Tooltip
            {...tooltipProps}
            content={(p) => (
              <ChartTooltip
                {...p}
                format={(v) => formatInt(v)}
                formatLabel={(label) => t('analytics.week', { date: String(label) })}
                totalLabel={t('analytics.total')}
              />
            )}
          />
          {parts.map((p, i) => (
            <Bar key={p.key} dataKey={p.key} name={p.label} {...stackedBarProps(i, parts.length)} />
          ))}
        </BarChart>
      </ChartCard>
    </div>
  );
}
