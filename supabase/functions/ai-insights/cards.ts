// The insight cards of ai-insights (CLAUDE.md §15): what Sonnet gets from public.analytics_bundle, and how its
// answer becomes cards the apps can trust.
//
// - Every detector row gets a ref («top_equipment.0»). The model sees compact rows: no order ids, no uuids,
//   pseudonyms instead of names, shares also as whole percents and counts it would otherwise compute itself.
// - A card names its rows in `refs`. Its evidence (order ids and the row's numbers) is copied from the bundle,
//   never from the model.
// - Every number in the card's text must come from its rows, the period or the detector windows (5 days after
//   ППР, 7 days for a repeat, 6 weeks of trend, a 3 hour peak). A card with any other number is dropped, and the
//   rules card of the same kind (public.insight_cards) takes its place.
// Pure functions, no Deno or Node globals.

import type { InsightCardAnswer, InsightsAnswer } from '../_shared/schemas.ts';
import { DAY_MS, isDetector, localDay, type Detector, type Scope } from './scope.ts';

export type Row = Record<string, unknown>;

export interface AnalyticsBundle {
  period?: { from?: string; to?: string; label?: string } | null;
  area?: string | null;
  [detector: string]: unknown;
}

export type Severity = 'info' | 'warning' | 'critical';
const SEVERITIES: readonly Severity[] = ['info', 'warning', 'critical'];

/** A card as public.insight_cards returns it and as ai_insights stores it. */
export interface Card {
  kind: string;
  severity: Severity;
  title: string;
  body: string;
  recommendation: string;
  evidence: { order_ids: number[]; stats: Row };
}

/** Rows per detector the model sees; the detectors already sort by strength. */
export const ROW_LIMITS: Readonly<Record<Detector, number>> = {
  top_equipment: 5,
  top_areas: 4,
  repeat_faults: 8,
  post_ppr: 3,
  time_patterns: 3,
  worker_repeats: 3,
  materials: 6,
  trend: 3,
};

export const MAX_CARDS = 8;

/** Detector windows a card may name without a row holding the number. */
export const DETECTOR_CONSTANTS: Readonly<Record<Detector, readonly number[]>> = {
  top_equipment: [],
  top_areas: [],
  repeat_faults: [],
  post_ppr: [5],
  time_patterns: [3, 8, 12, 20],
  worker_repeats: [7],
  materials: [],
  trend: [2, 6],
};

export function detectorRows(bundle: AnalyticsBundle, kind: Detector): Row[] {
  const rows = bundle[kind];
  return Array.isArray(rows)
    ? rows.filter((r): r is Row => !!r && typeof r === 'object' && !Array.isArray(r))
    : [];
}

const n = (v: unknown): number | null => {
  const x = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof x === 'number' && Number.isFinite(x) ? x : null;
};

/** top_areas always lists every area; a finding there needs at least one unplanned failure. */
function rowCounts(kind: Detector, row: Row): boolean {
  return kind !== 'top_areas' || (n(row.unplanned) ?? 0) > 0;
}

/** True when any detector found something worth a card (top_areas alone, with one area, is not). */
export function hasFindings(bundle: AnalyticsBundle): boolean {
  return (
    [
      'top_equipment',
      'repeat_faults',
      'post_ppr',
      'time_patterns',
      'worker_repeats',
      'materials',
      'trend',
    ] as const
  ).some((k) => detectorRows(bundle, k).length > 0);
}

// ---------------------------------------------------------------------------
// the model's input
// ---------------------------------------------------------------------------

export interface RefEntry {
  ref: string;
  kind: Detector;
  /** The row as the bundle holds it: evidence comes from here. */
  row: Row;
  /** The row as the model sees it. */
  compact: Row;
}

const pct = (v: unknown): number | null => {
  const x = n(v);
  return x === null ? null : Math.round(x * 100);
};

function orderIds(row: Row): number[] {
  const raw = row.order_ids;
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const v of raw) {
    const x = n(v);
    if (x !== null && Number.isSafeInteger(x) && !out.includes(x)) out.push(x);
  }
  return out;
}

/** Drops null values, so the model never reads «null» as a number. */
function clean(o: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(o)) if (v !== null && v !== undefined) out[k] = v;
  return out;
}

export function compactRow(kind: Detector, row: Row, ref: string): Row {
  const orders = orderIds(row).length;
  switch (kind) {
    case 'top_equipment':
      return clean({
        ref,
        name: row.name,
        area: row.area,
        unplanned: row.unplanned,
        downtime_h: row.downtime_h,
        fleet_median: row.fleet_median,
        ratio_to_median: row.ratio_to_median,
        top_codes: Array.isArray(row.top_codes)
          ? (row.top_codes as Row[]).map((c) =>
              clean({ code: c.code, name: c.name, count: c.count, share_pct: pct(c.share) }),
            )
          : [],
      });
    case 'top_areas':
      return clean({
        ref,
        name: row.name,
        units: row.units,
        unplanned: row.unplanned,
        per_unit: row.per_unit,
        downtime_h: row.downtime_h,
      });
    case 'repeat_faults':
      return clean({
        ref,
        name: row.name,
        code: row.code,
        code_name: row.code_name,
        count: row.count,
        median_days_between: row.median_days_between,
        workers: row.workers,
      });
    case 'post_ppr': {
      const share = n(row.followed_by_failure);
      const planned = n(row.planned);
      return clean({
        ref,
        name: row.name,
        planned: row.planned,
        followed_count: share !== null && planned !== null ? Math.round(share * planned) : null,
        followed_pct: pct(row.followed_by_failure),
        unit_base_pct: pct(row.unit_base),
        lift: row.lift,
        brigade: row.brigade,
        brigade_planned: row.brigade_planned,
      });
    }
    case 'time_patterns': {
      const share = n(row.peak_share);
      const count = n(row.count);
      return clean({
        ref,
        area: row.area,
        group_name: row.group_name,
        count: row.count,
        night: row.night,
        day: row.day,
        night_to_day: row.night_to_day,
        peak_from: row.peak_from,
        peak_to: row.peak_to,
        peak_pct: pct(row.peak_share),
        peak_count: share !== null && count !== null ? Math.round(share * count) : null,
      });
    }
    case 'worker_repeats':
      return clean({
        ref,
        // the pseudonym, never the name: the privacy gateway would redact it anyway (CLAUDE.md §16)
        who: row.pseudonym,
        brigade: n(row.brigade_id) !== null ? `Бригада ${n(row.brigade_id)}` : null,
        repairs: row.repairs,
        repeat_pct: pct(row.repeat_share),
        team_pct: pct(row.team_share),
        rework_pct: pct(row.rework_share),
        team_rework_pct: pct(row.team_rework_share),
      });
    case 'materials':
      return clean({
        ref,
        // a brigade name, or a worker's short name that the privacy gateway turns into the pseudonym
        who: row.name,
        who_kind: row.kind === 'worker' ? 'исполнитель' : 'бригада',
        material: row.material,
        unit: row.unit,
        code: row.code,
        orders: row.orders,
        avg_qty: row.avg_qty,
        reference_qty: row.reference_qty,
        ratio: row.ratio,
      });
    case 'trend':
      return clean({
        ref,
        name: row.name,
        weekly: row.weekly,
        slope_per_week: row.slope_per_week,
        first_2_weeks: row.first_2_weeks,
        last_2_weeks: row.last_2_weeks,
        orders,
      });
  }
}

/**
 * The rows the model may cite, by ref. With a focus, only the focus detectors (when one of them found something);
 * top_areas only across all areas.
 */
export function collectRefs(
  bundle: AnalyticsBundle,
  focus: readonly Detector[],
  scope: Pick<Scope, 'filters'>,
): Map<string, RefEntry> {
  const kinds: Detector[] = (
    [
      'top_equipment',
      'top_areas',
      'repeat_faults',
      'post_ppr',
      'time_patterns',
      'worker_repeats',
      'materials',
      'trend',
    ] as const
  ).filter((k) => k !== 'top_areas' || scope.filters.area_id == null);
  const focused = kinds.filter((k) => focus.includes(k));
  const useFocus = focused.some((k) => detectorRows(bundle, k).some((r) => rowCounts(k, r)));
  const out = new Map<string, RefEntry>();
  for (const kind of useFocus ? focused : kinds) {
    const rows = detectorRows(bundle, kind).filter((r) => rowCounts(kind, r));
    rows.slice(0, ROW_LIMITS[kind]).forEach((row, i) => {
      const ref = `${kind}.${i}`;
      out.set(ref, { ref, kind, row, compact: compactRow(kind, row, ref) });
    });
  }
  return out;
}

const MONTHS_GEN = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

/** «8 июля 2026», local day of an instant. */
export function dayInWords(ms: number): string {
  const [y, m, d] = localDay(ms).split('-').map(Number) as [number, number, number];
  return `${d} ${MONTHS_GEN[m - 1]} ${y}`;
}

/** The last local day a period covers (`to` is exclusive). */
export function lastDay(scope: Pick<Scope, 'to'>): number {
  return Date.parse(scope.to) - 1;
}

/** The user message of the insights call. */
export function insightsMessage(scope: Scope, refs: ReadonlyMap<string, RefEntry>): string {
  const data: Record<string, Row[]> = {};
  for (const e of refs.values()) (data[e.kind] ??= []).push(e.compact);
  const lines = [
    `Период: ${scope.label}, с ${dayInWords(Date.parse(scope.from))} по ${dayInWords(lastDay(scope))} (Asia/Qostanay).`,
    `Участок: ${scope.area_name ?? 'все участки'}.`,
  ];
  if (scope.focus.length > 0) lines.push(`Фокус вопроса: ${scope.focus.join(', ')}.`);
  if (scope.query) lines.push(`Вопрос руководителя: «${scope.query}».`);
  lines.push('', 'Строки детекторов (JSON):', JSON.stringify(data));
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// numbers: what a card may say
// ---------------------------------------------------------------------------

/**
 * The numbers a text states: dates (08.07.2026) and times (02:00) give their parts, «2,6» and «2.6» are one
 * decimal, «41%» is 41. Signs are ignored.
 */
export function numbersIn(text: string): number[] {
  const out: number[] = [];
  let rest = text.replace(/\b(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?(?!\d|[.,]\d)/g, (m, d, mo, y) => {
    // only real calendar dates; «2.6» stays a decimal
    const day = Number(d);
    const month = Number(mo);
    if (y === undefined || day < 1 || day > 31 || month < 1 || month > 12) return m;
    out.push(day, month, Number(y));
    return ' ';
  });
  rest = rest.replace(/\b(\d{1,2}):(\d{2})\b/g, (_m, h, mi) => {
    out.push(Number(h), Number(mi));
    return ' ';
  });
  for (const m of rest.matchAll(/\d+(?:[.,]\d+)?/g)) out.push(Number(m[0].replace(',', '.')));
  return out;
}

/** Every number a value holds: numbers, numeric strings, numbers inside strings and inside keys. */
export function collectNumbers(value: unknown, out: number[] = []): number[] {
  if (typeof value === 'number') {
    if (Number.isFinite(value)) out.push(value);
  } else if (typeof value === 'string') {
    out.push(...numbersIn(value));
  } else if (Array.isArray(value)) {
    for (const v of value) collectNumbers(v, out);
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === 'order_ids' || k === 'employee_id' || k === 'id') continue;
      out.push(...numbersIn(k.replace(/_/g, ' ')));
      collectNumbers(v, out);
    }
  }
  return out;
}

const key = (x: number): string => String(Math.round(Math.abs(x) * 100) / 100);

/** A number and the ways a text may round it: whole, one decimal, and shares (0..1) as percents. */
export function numberForms(values: readonly number[]): Set<string> {
  const out = new Set<string>();
  for (const v of values) {
    const a = Math.abs(v);
    out.add(key(a));
    out.add(key(Math.round(a)));
    out.add(key(Math.round(a * 10) / 10));
    if (a <= 1) {
      out.add(key(a * 100));
      out.add(key(Math.round(a * 100)));
      out.add(key(Math.round(a * 1000) / 10));
    }
  }
  return out;
}

/** Numbers of the period a card may name: the label («30 дней»), the length in days, the first and last day. */
export function scopeNumbers(scope: Pick<Scope, 'from' | 'to' | 'label'>): number[] {
  const from = Date.parse(scope.from);
  const to = Date.parse(scope.to);
  const days = (to - from) / DAY_MS;
  return [
    ...numbersIn(scope.label),
    Math.round(days),
    ...localDay(from).split('-').map(Number),
    ...localDay(lastDay(scope)).split('-').map(Number),
  ];
}

/** The numbers of the card's text that none of its rows, the period or the windows hold. */
export function ungroundedNumbers(
  text: string,
  entries: readonly RefEntry[],
  extra: readonly number[],
): number[] {
  const allowed = numberForms([
    ...extra,
    ...entries.flatMap((e) => [
      ...collectNumbers(e.row),
      ...collectNumbers(e.compact),
      ...DETECTOR_CONSTANTS[e.kind],
    ]),
  ]);
  return numbersIn(text).filter((x) => !allowed.has(key(x)));
}

// ---------------------------------------------------------------------------
// the model's answer → cards
// ---------------------------------------------------------------------------

/** A dash between spaces: figure dash to horizontal bar (U+2012 to U+2015), minus sign, hyphen. ASCII source. */
const SPACED_DASH = new RegExp('\\s+[\\u2012-\\u2015\\u2212-]+\\s+', 'g');

/**
 * One line of plain text: spaced dashes become commas (UI copy has no dashes; «М-02» keeps its hyphen), decimals
 * get the Russian comma («254.7» → «254,7», dates untouched), and a short name rehydrated before a full stop
 * loses the doubled period («Касымов Б..» → «Касымов Б.»).
 */
export function cleanText(s: unknown): string {
  if (typeof s !== 'string') return '';
  return s
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(SPACED_DASH, ', ')
    .replace(/(?<![\d.])(\d+)\.(\d+)(?![\d.])/g, '$1,$2')
    .replace(/([^.])\.\.(?!\.)/g, '$1.')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

export type DropReason = 'no_refs' | 'empty' | 'ungrounded' | 'duplicate' | 'too_many';

export interface Dropped {
  /** The kind the model gave the card, or of its first known row. */
  kind: string;
  reason: DropReason;
  /** Position in the model's answer, so a rules card can take that place. */
  index: number;
  numbers?: number[];
}

export interface Assembled {
  cards: (Card & { index: number })[];
  dropped: Dropped[];
}

const TEXT_LIMIT = 1200;

function evidenceOf(entries: readonly RefEntry[]): Card['evidence'] {
  const ids: number[] = [];
  for (const e of entries) for (const id of orderIds(e.row)) if (!ids.includes(id)) ids.push(id);
  const main = entries[0]!;
  const { order_ids: _ids, ...stats } = main.row;
  return { order_ids: ids, stats: { ...stats, refs: entries.map((e) => e.ref) } };
}

export function assembleCards(
  answer: InsightsAnswer | null | undefined,
  refs: ReadonlyMap<string, RefEntry>,
  scope: Pick<Scope, 'from' | 'to' | 'label'>,
): Assembled {
  const list: InsightCardAnswer[] = Array.isArray(answer?.cards) ? answer.cards : [];
  const extra = scopeNumbers(scope);
  const cards: Assembled['cards'] = [];
  const dropped: Dropped[] = [];
  const usedMain = new Set<string>();

  list.forEach((raw, index) => {
    const asked = Array.isArray(raw?.refs) ? raw.refs : [];
    const entries: RefEntry[] = [];
    for (const r of asked) {
      const e = typeof r === 'string' ? refs.get(r.trim()) : undefined;
      if (e && !entries.includes(e)) entries.push(e);
    }
    const declared = typeof raw?.kind === 'string' ? raw.kind : '';
    if (entries.length === 0) {
      dropped.push({ kind: declared, reason: 'no_refs', index });
      return;
    }
    // the main row: the one of the declared kind, else the first; the card takes its kind
    const mainIdx = Math.max(
      0,
      entries.findIndex((e) => e.kind === declared),
    );
    const ordered = [entries[mainIdx]!, ...entries.filter((_, i) => i !== mainIdx)];
    const main = ordered[0]!;
    const kind: string = main.kind;

    const title = cleanText(raw.title);
    const body = cleanText(raw.body);
    const recommendation = cleanText(raw.recommendation);
    if (!title || !body || title.length + body.length + recommendation.length > TEXT_LIMIT) {
      dropped.push({ kind, reason: 'empty', index });
      return;
    }
    const numbers = ungroundedNumbers(`${title}\n${body}\n${recommendation}`, ordered, extra);
    if (numbers.length > 0) {
      dropped.push({ kind, reason: 'ungrounded', index, numbers });
      return;
    }
    if (usedMain.has(main.ref)) {
      dropped.push({ kind, reason: 'duplicate', index });
      return;
    }
    if (cards.length >= MAX_CARDS) {
      dropped.push({ kind, reason: 'too_many', index });
      return;
    }
    usedMain.add(main.ref);
    const severity: Severity = SEVERITIES.includes(raw.severity as Severity)
      ? (raw.severity as Severity)
      : 'info';
    cards.push({
      index,
      kind,
      severity,
      title,
      body,
      recommendation,
      evidence: evidenceOf(ordered),
    });
  });
  return { cards, dropped };
}

/** With a focus, only its kinds, unless that leaves nothing. */
export function focusCards<T extends { kind: string }>(
  cards: readonly T[],
  focus: readonly Detector[],
): T[] {
  if (focus.length === 0) return [...cards];
  const kept = cards.filter((c) => isDetector(c.kind) && focus.includes(c.kind));
  return kept.length > 0 ? kept : [...cards];
}

/**
 * The model's cards with rules cards in the places of the ones dropped for an unknown ref or a number the data
 * does not hold, one per kind and only for a kind the model's kept cards do not cover.
 */
export function mergeWithRules(
  assembled: Assembled,
  rules: readonly Card[],
): { cards: Card[]; replaced: number } {
  const covered = new Set(assembled.cards.map((c) => c.kind));
  const slots: (Card & { index: number })[] = [...assembled.cards];
  let replaced = 0;
  for (const d of assembled.dropped) {
    if (d.reason !== 'ungrounded' && d.reason !== 'no_refs') continue;
    if (covered.has(d.kind)) continue;
    const rule = rules.find((r) => r.kind === d.kind);
    if (!rule) continue;
    covered.add(d.kind);
    slots.push({ ...rule, index: d.index });
    replaced += 1;
  }
  slots.sort((a, b) => a.index - b.index);
  return { cards: slots.slice(0, MAX_CARDS).map(({ index: _i, ...c }) => c), replaced };
}

/**
 * What identifies a finding across two calls (the downtime of open orders moves with the clock, so rows are not
 * compared whole). Material rows of a worker and of the brigade with the same code and material are one finding.
 */
export function rowIdentity(kind: string, row: Row): string {
  const k = (...keys: string[]): string =>
    `${kind}:${keys.map((x) => String(row[x] ?? '')).join('|')}`;
  switch (kind) {
    case 'top_equipment':
    case 'post_ppr':
    case 'trend':
      return k('equipment_id');
    case 'repeat_faults':
      return k('equipment_id', 'code');
    case 'time_patterns':
      return k('area_id', 'group');
    case 'worker_repeats':
      return k('employee_id');
    case 'materials':
      return k('code', 'material_id');
    case 'top_areas':
      return k('area_id');
    default:
      return `${kind}:${JSON.stringify(row)}`;
  }
}

/** The model writes at most MAX_CARDS; findings it left out may bring the answer up to this many. */
export const MAX_TOTAL_CARDS = 12;

/**
 * Rules cards for findings the model left out, after the model's cards, so the planted patterns always show: a
 * rules card whose detector row no model card cites (or, when that row was not sent, whose kind no model card
 * has). With a focus, only rules cards of the focus kinds. Up to MAX_TOTAL_CARDS.
 */
export function fillUncovered(
  cards: readonly Card[],
  rules: readonly Card[],
  refs: ReadonlyMap<string, RefEntry>,
  focus: readonly Detector[],
): { cards: Card[]; filled: number } {
  const cited = new Set<string>();
  for (const c of cards) {
    const list = c.evidence.stats.refs;
    if (!Array.isArray(list)) continue;
    for (const ref of list) {
      const e = refs.get(String(ref));
      if (e) cited.add(rowIdentity(e.kind, e.row));
    }
  }
  const sent = new Set([...refs.values()].map((e) => rowIdentity(e.kind, e.row)));
  const kinds = new Set(cards.map((c) => c.kind));
  const out = [...cards];
  let filled = 0;
  for (const rule of rules) {
    if (out.length >= MAX_TOTAL_CARDS) break;
    if (focus.length > 0 && !(isDetector(rule.kind) && focus.includes(rule.kind))) continue;
    if (out.some((c) => c.title === rule.title)) continue;
    const id = rowIdentity(rule.kind, rule.evidence.stats);
    if (sent.has(id) ? cited.has(id) : kinds.has(rule.kind)) continue;
    out.push(rule);
    filled += 1;
  }
  return { cards: out, filled };
}

/** A rules card from public.insight_cards, checked and given the Card shape. */
export function normalizeRuleCard(raw: unknown): Card | null {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Row;
  const title = typeof o.title === 'string' ? o.title : '';
  const body = typeof o.body === 'string' ? o.body : '';
  if (typeof o.kind !== 'string' || !title || !body) return null;
  const ev = (o.evidence && typeof o.evidence === 'object' ? o.evidence : {}) as Row;
  const stats = (
    ev.stats && typeof ev.stats === 'object' && !Array.isArray(ev.stats) ? ev.stats : {}
  ) as Row;
  return {
    kind: o.kind,
    severity: SEVERITIES.includes(o.severity as Severity) ? (o.severity as Severity) : 'info',
    title,
    body,
    recommendation: typeof o.recommendation === 'string' ? o.recommendation : '',
    evidence: { order_ids: orderIds(ev), stats },
  };
}
