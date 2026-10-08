// /analytics (master, manager): insight cards (CLAUDE.md §15) for the FilterBar period and area, or for a question
// in the ask box («покажи проблемы участка дробления за месяц»). The ai-insights Edge Function reads the question
// (Haiku), writes the cards from the detector numbers (Sonnet) and falls back to rpc insight_cards; the scope chips
// say how the question was understood and where the cards came from. A card shows severity as a dot plus a word,
// the text, the recommendation and «Доказательства»: key numbers, a mini chart of the detector row, the evidence
// orders as links to /orders/:id, a weekly chart of those orders and the unit's history. The question lives in the
// URL (?q=), so an answer can be reloaded and linked. The mascot «search» shows while the detectors run.
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
  type InsightScope,
  type Severity,
  type Tone,
} from '@rota/shared';
import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Bar, BarChart, CartesianGrid, LabelList, Tooltip, XAxis, YAxis } from 'recharts';
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
  barProps,
  chartTokens,
  gridProps,
  series,
  stackedBarProps,
  tooltipProps,
  xAxisProps,
  yAxisProps,
} from '@/lib/chart';
import { useReportFilter } from '@/lib/filters';
import { t, type Key } from '@/lib/i18n';
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

const MAX_QUERY = 300;
const EXAMPLES: readonly Key[] = [
  'analytics.ask.example_1',
  'analytics.ask.example_2',
  'analytics.ask.example_3',
];

export function AnalyticsPage() {
  const { preset, period, filters, fromDay, toDay } = useReportFilter();
  const [params, setParams] = useSearchParams();
  const query = (params.get('q') ?? '').trim().slice(0, MAX_QUERY);
  const insights = useInsights({ ...period, filters, ...(query ? { query } : {}) });
  const answer = insights.data;
  // the evidence orders load once, when the first «Доказательства» opens, for the period the cards answer
  const [evidenceWanted, setEvidenceWanted] = useState(false);
  const scopePeriod = answer ? { from: answer.scope.from, to: answer.scope.to } : period;
  const evidence = useEvidenceOrders(scopePeriod, answer?.scope.filters ?? filters, evidenceWanted);
  const asking = insights.isFetching && (insights.isPlaceholderData || !answer);

  const ask = (q: string) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      const clean = q.replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY);
      if (clean) next.set('q', clean);
      else next.delete('q');
      return next;
    });
  };

  return (
    <Page title={t('page.analytics')} eyebrow={periodEyebrow(preset, period, fromDay, toDay)}>
      <AskBox query={query} pending={asking} onAsk={ask} />
      {answer !== undefined ? (
        <Stale stale={insights.isPlaceholderData}>
          <ScopeBar scope={answer.scope} />
          {answer.cards.length === 0 ? (
            <EmptyState
              mascot="peek"
              title={t('analytics.empty_title')}
              text={t('analytics.empty_text')}
            />
          ) : (
            <Section
              title={t('analytics.cards')}
              aside={
                <span className={rs.note}>{formatCount(answer.cards.length, INSIGHT_FORMS)}</span>
              }
            >
              <div className={styles.cards}>
                {answer.cards.map((card, i) => (
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
          )}
        </Stale>
      ) : insights.isError ? (
        <ErrorState error={insights.error} onRetry={() => void insights.refetch()} />
      ) : (
        <EmptyState
          mascot="search"
          title={t('analytics.loading_title')}
          text={query ? t('analytics.ask.asking') : t('analytics.loading_text')}
        />
      )}
    </Page>
  );
}

// ---------------------------------------------------------------------------
// the ask box and the scope chips
// ---------------------------------------------------------------------------

/** The question of the ask box. Submitting puts it into the URL; the page asks ai-insights for it. */
function AskBox({
  query,
  pending,
  onAsk,
}: {
  query: string;
  pending: boolean;
  onAsk: (q: string) => void;
}) {
  const [draft, setDraft] = useState(query);
  // a new question from the URL (back button, a link) replaces the draft
  useEffect(() => setDraft(query), [query]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onAsk(draft);
  };
  return (
    <Card pad="l">
      <form className={styles.ask} onSubmit={submit} role="search">
        <div className={styles.askRow}>
          <Field label={t('analytics.ask.label')}>
            {(id) => (
              <Input
                id={id}
                type="search"
                enterKeyHint="search"
                maxLength={MAX_QUERY}
                placeholder={t('analytics.ask.placeholder')}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
            )}
          </Field>
          <Button type="submit" disabled={!draft.trim() || pending}>
            {t('analytics.ask.submit')}
          </Button>
          {query ? (
            <Button type="button" variant="secondary" onClick={() => onAsk('')}>
              {t('analytics.ask.clear')}
            </Button>
          ) : null}
        </div>
        {pending ? (
          <div className={styles.asking} role="status">
            <Loading />
            <span>{t('analytics.ask.asking')}</span>
          </div>
        ) : (
          <div className={styles.examples}>
            <span className={rs.note}>{t('analytics.ask.examples')}</span>
            {EXAMPLES.map((k) => (
              <button
                key={k}
                type="button"
                className={styles.example}
                onClick={() => {
                  setDraft(t(k));
                  onAsk(t(k));
                }}
              >
                {t(k)}
              </button>
            ))}
          </div>
        )}
        <p className={rs.note}>{t('analytics.ask.hint')}</p>
      </form>
    </Card>
  );
}

const SOURCE_TONE: Readonly<Record<InsightScope['source'], Tone>> = {
  llm: 'info',
  mixed: 'info',
  rules: 'neutral',
};

/** What the cards answer: the period, the dates, the area and the focus, then where the cards came from. */
function ScopeBar({ scope }: { scope: InsightScope }) {
  const asked = scope.query != null;
  const last = Date.parse(scope.to) - 1;
  const chips = [
    t('analytics.scope.period', { label: scope.label }),
    t('analytics.scope.dates', { from: ddmm(scope.from), to: ddmm(last) }),
    scope.area_name ?? t('analytics.scope.all_areas'),
    ...scope.focus.map(kindLabel),
  ];
  return (
    <div className={styles.scope}>
      <Eyebrow>{asked ? t('analytics.scope.question') : t('analytics.scope.period_title')}</Eyebrow>
      <ul className={styles.chips}>
        {chips.map((c) => (
          <li key={c} className={styles.chip}>
            {c}
          </li>
        ))}
      </ul>
      <div className={styles.scopeMeta}>
        <Pill tone={SOURCE_TONE[scope.source]}>{t(`analytics.scope.source.${scope.source}`)}</Pill>
        {asked && scope.parsed_by ? (
          <span className={rs.note}>{t(`analytics.scope.parsed.${scope.parsed_by}`)}</span>
        ) : null}
        {scope.cached ? <span className={rs.note}>{t('analytics.scope.cached')}</span> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// a card
// ---------------------------------------------------------------------------

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
  // an unknown severity reads as info rather than a raw key
  const severity: Severity = SEVERITIES.includes(card.severity) ? card.severity : 'info';
  // model cards list the detector rows they cite; rules cards do not
  const byModel = Array.isArray(card.evidence?.stats?.refs);
  return (
    <Card pad="l">
      <article className={styles.card}>
        <div className={styles.cardTop}>
          <Pill tone={SEVERITY_TONE[severity]}>{t(`analytics.severity.${severity}`)}</Pill>
          <Tag>{kindLabel(card.kind)}</Tag>
          {byModel ? <Tag>{t('analytics.card.ai')}</Tag> : null}
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
  const chart = useMemo(() => statChart(card.kind, stats), [card.kind, stats]);

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

      {chart ? <StatChart spec={chart} /> : null}

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

      {found.length > 0 && card.kind !== 'trend' ? <WeeklyChart orders={found} /> : null}

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
  'units',
  'per_unit',
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
  'units',
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
// the mini chart of the detector row (evidence.stats)
// ---------------------------------------------------------------------------

interface StatChartSpec {
  title: string;
  subtitle: string;
  /** How a value prints: a count, a percent, a quantity with its unit. */
  format: (v: number) => string;
  /** Values in the units they print in (shares already as percents), so the axis scales them as they read. */
  bars: { label: string; value: number }[];
}

const asCount = (v: number) => formatInt(v);
const asPercent = (v: number) => `${formatInt(v)}%`;

/** Two numbers of the row side by side; `percent` turns shares (0..1) into whole percents. */
function pair(
  stats: Record<string, unknown>,
  a: [string, Key],
  b: [string, Key],
  percent = false,
): { label: string; value: number }[] | null {
  const va = num(stats[a[0]]);
  const vb = num(stats[b[0]]);
  if (va == null || vb == null) return null;
  const scale = (v: number) => (percent ? Math.round(v * 100) : v);
  return [
    { label: t(a[1]), value: scale(va) },
    { label: t(b[1]), value: scale(vb) },
  ];
}

/** A small chart for the kinds whose row holds a comparison: codes, night and day, worker and team, … */
function statChart(kind: string, stats: Record<string, unknown>): StatChartSpec | null {
  switch (kind) {
    case 'top_equipment': {
      const codes = Array.isArray(stats.top_codes)
        ? (stats.top_codes as Record<string, unknown>[])
        : [];
      const bars = codes
        .map((c) => ({ label: String(c.code ?? ''), value: num(c.count) }))
        .filter((b): b is { label: string; value: number } => b.label !== '' && b.value != null);
      return bars.length >= 2
        ? {
            title: t('analytics.chart.codes'),
            subtitle: t('analytics.chart.codes_hint'),
            format: asCount,
            bars,
          }
        : null;
    }
    case 'time_patterns': {
      const bars = pair(stats, ['night', 'analytics.chart.night'], ['day', 'analytics.chart.day']);
      return bars
        ? {
            title: t('analytics.chart.night_day'),
            subtitle: t('analytics.chart.night_day_hint'),
            format: asCount,
            bars,
          }
        : null;
    }
    case 'worker_repeats': {
      const bars = pair(
        stats,
        ['repeat_share', 'analytics.chart.worker'],
        ['team_share', 'analytics.chart.team'],
        true,
      );
      return bars
        ? {
            title: t('analytics.chart.repeat'),
            subtitle: t('analytics.chart.repeat_hint'),
            format: asPercent,
            bars,
          }
        : null;
    }
    case 'post_ppr': {
      const bars = pair(
        stats,
        ['followed_by_failure', 'analytics.chart.after_ppr'],
        ['unit_base', 'analytics.chart.other_time'],
        true,
      );
      return bars
        ? {
            title: t('analytics.chart.ppr'),
            subtitle: t('analytics.chart.ppr_hint'),
            format: asPercent,
            bars,
          }
        : null;
    }
    case 'materials': {
      const bars = pair(
        stats,
        ['avg_qty', 'analytics.chart.actual'],
        ['reference_qty', 'analytics.chart.norm'],
      );
      const unit = typeof stats.unit === 'string' ? stats.unit : '';
      return bars
        ? {
            title: t('analytics.chart.qty'),
            subtitle: typeof stats.material === 'string' ? stats.material : '',
            format: (v) => (unit ? `${ruNum(v)} ${unit}` : ruNum(v)),
            bars,
          }
        : null;
    }
    case 'trend': {
      const weekly = Array.isArray(stats.weekly) ? stats.weekly.map((v) => num(v)) : [];
      if (weekly.length < 2 || weekly.some((v) => v == null)) return null;
      return {
        title: t('analytics.chart.weeks'),
        subtitle: t('analytics.chart.weeks_hint'),
        format: asCount,
        bars: (weekly as number[]).map((value, i) => ({
          label: t('analytics.chart.week_n', { n: i + 1 }),
          value,
        })),
      };
    }
    default:
      return null;
  }
}

/** One series in the primary slot; every bar carries its value, so the chart reads without the tooltip. */
function StatChart({ spec }: { spec: StatChartSpec }) {
  const data = spec.bars.map((b) => ({ label: b.label, value: b.value }));
  return (
    <div className={styles.miniChart}>
      <ChartCard title={spec.title} subtitle={spec.subtitle} height={150}>
        <BarChart data={data} margin={{ top: 20, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis {...xAxisProps} dataKey="label" interval={0} />
          <YAxis {...yAxisProps} width={36} allowDecimals hide />
          <Tooltip
            {...tooltipProps}
            content={(p) => <ChartTooltip {...p} format={(v) => spec.format(v)} />}
          />
          <Bar dataKey="value" name={t('analytics.chart.value')} {...barProps(0)}>
            <LabelList
              dataKey="value"
              position="top"
              fill={chartTokens.text}
              fontSize={12}
              fontFamily={chartTokens.fontMono}
              formatter={(v: unknown) => spec.format(Number(v))}
            />
          </Bar>
        </BarChart>
      </ChartCard>
    </div>
  );
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
