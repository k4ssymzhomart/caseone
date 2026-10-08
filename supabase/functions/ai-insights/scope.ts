// What a request asks about (CLAUDE.md §15): the period, the report filter and the question of the ask box.
// The question is read by Haiku (parse_query) when the LLM is on, else by the keyword reader below, which also
// covers a failed parse. Both end in the same QueryReading, checked against the areas table and the clock.
// Pure functions, no Deno or Node globals; Asia/Qostanay is a fixed UTC+5 (no Intl time zones).

import type { ParseQueryAnswer } from '../_shared/schemas.ts';

export const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const OFFSET_MS = 5 * HOUR_MS;
/** The period when the request names none: the FilterBar default of /analytics. */
export const DEFAULT_PERIOD_DAYS = 30;
export const MAX_PERIOD_DAYS = 366;
/** «за 3 месяца» and «за квартал»: the whole generated history (CLAUDE.md §19). */
export const QUARTER_DAYS = 92;
export const MAX_QUERY_CHARS = 300;
/** A period may end a little after the server clock (the FilterBar rounds up to the next minute). */
const FUTURE_SLACK_MS = 2 * 60_000;

/** The detectors of public.analytics_bundle (migration rota_detectors), also the focus values. */
export const DETECTORS = [
  'top_equipment',
  'top_areas',
  'repeat_faults',
  'post_ppr',
  'time_patterns',
  'worker_repeats',
  'materials',
  'trend',
] as const;
export type Detector = (typeof DETECTORS)[number];

export function isDetector(v: unknown): v is Detector {
  return typeof v === 'string' && (DETECTORS as readonly string[]).includes(v);
}

export interface Area {
  id: number;
  name: string;
}

/** The jsonb filter of the report RPCs (CLAUDE.md §14). The detectors read area_id; the rest passes through. */
export interface InsightFilters {
  area_id?: number;
  equipment_id?: number;
  assignee_id?: string;
  brigade_id?: number;
}

export interface Period {
  from: number;
  to: number;
}

/** What the question says. A null period or area means the question did not name one. */
export interface QueryReading {
  area_id: number | null;
  period: Period | null;
  focus: Detector[];
}

export type ParsedBy = 'llm' | 'rules';

/** The resolved scope of one answer; the cards carry it in ai_insights.scope. */
export interface Scope {
  from: string;
  to: string;
  /** internal.period_label: «неделю», «30 дней», «3 месяца», else «N дней». */
  label: string;
  filters: InsightFilters;
  area_name: string | null;
  focus: Detector[];
  query: string | null;
  parsed_by: ParsedBy | null;
}

// ---------------------------------------------------------------------------
// time
// ---------------------------------------------------------------------------

/** ISO 8601 in Asia/Qostanay (+05:00), seconds precision. */
export function qostanayIso(ms: number): string {
  return `${new Date(ms + OFFSET_MS).toISOString().slice(0, 19)}+05:00`;
}

/** The local calendar day of an instant, YYYY-MM-DD. */
export function localDay(ms: number): string {
  return new Date(ms + OFFSET_MS).toISOString().slice(0, 10);
}

/** The instant of the local midnight that starts the day of `ms`. */
export function localMidnight(ms: number): number {
  return Math.floor((ms + OFFSET_MS) / DAY_MS) * DAY_MS - OFFSET_MS;
}

/** Start of the current shift: day 08:00 to 20:00, night 20:00 to 08:00 (CLAUDE.md §14). */
export function shiftStart(ms: number): number {
  const midnight = localMidnight(ms);
  const hour = Math.floor((ms - midnight) / HOUR_MS);
  if (hour >= 8 && hour < 20) return midnight + 8 * HOUR_MS;
  if (hour >= 20) return midnight + 20 * HOUR_MS;
  return midnight - 4 * HOUR_MS;
}

const ru = (n: number, one: string, few: string, many: string): string => {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
};

/** internal.period_label of migration rota_detectors, word for word. */
export function periodLabel(from: number, to: number): string {
  const d = Math.round((to - from) / DAY_MS);
  if (d >= 6 && d <= 8) return 'неделю';
  if (d >= 28 && d <= 31) return '30 дней';
  if (d >= 85 && d <= 95) return '3 месяца';
  return `${d} ${ru(d, 'день', 'дня', 'дней')}`;
}

/** The 7 local days before today's local midnight: the weekly digest (cron on Monday 08:00 local). */
export function digestPeriod(now: number): Period {
  const to = localMidnight(now);
  return { from: to - 7 * DAY_MS, to };
}

/** Keeps a period inside [now − MAX_PERIOD_DAYS, now + slack]; null when nothing sensible is left. */
export function clampPeriod(p: Period, now: number): Period | null {
  if (!Number.isFinite(p.from) || !Number.isFinite(p.to)) return null;
  const to = Math.min(p.to, now + FUTURE_SLACK_MS);
  const from = Math.max(p.from, to - MAX_PERIOD_DAYS * DAY_MS);
  return from < to ? { from, to } : null;
}

// ---------------------------------------------------------------------------
// the request body
// ---------------------------------------------------------------------------

const positiveInt = (v: unknown): number | undefined => {
  const n = typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v;
  return typeof n === 'number' && Number.isSafeInteger(n) && n > 0 ? n : undefined;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only the four keys of the shared filter, each checked; anything else is dropped. */
export function sanitizeFilters(raw: unknown): InsightFilters {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: InsightFilters = {};
  const area = positiveInt(o.area_id);
  const equipment = positiveInt(o.equipment_id);
  const brigade = positiveInt(o.brigade_id);
  if (area !== undefined) out.area_id = area;
  if (equipment !== undefined) out.equipment_id = equipment;
  if (brigade !== undefined) out.brigade_id = brigade;
  if (typeof o.assignee_id === 'string' && UUID.test(o.assignee_id))
    out.assignee_id = o.assignee_id.toLowerCase();
  return out;
}

/** The FilterBar period of the body ({from, to} ISO), else the last DEFAULT_PERIOD_DAYS. */
export function requestPeriod(body: unknown, now: number): Period {
  const o = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const from = typeof o.from === 'string' ? Date.parse(o.from) : NaN;
  const to = typeof o.to === 'string' ? Date.parse(o.to) : NaN;
  const asked = Number.isFinite(from)
    ? clampPeriod({ from, to: Number.isFinite(to) ? to : now }, now)
    : null;
  return asked ?? { from: now - DEFAULT_PERIOD_DAYS * DAY_MS, to: now };
}

/** The question: trimmed, whitespace collapsed, at most MAX_QUERY_CHARS; null when empty. */
export function sanitizeQuery(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const q = raw
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return q ? q.slice(0, MAX_QUERY_CHARS) : null;
}

// ---------------------------------------------------------------------------
// reading the question
// ---------------------------------------------------------------------------

const normalize = (s: string): string => s.toLowerCase().replace(/ё/g, 'е');

/** Stems of an area name: «Участок дробления» → «дробл»; the generic word «участок» is left out. */
export function areaStems(name: string): string[] {
  return normalize(name)
    .split(/[^\p{L}]+/u)
    .filter((w) => w.length >= 4 && w !== 'участок')
    .map((w) => (w.length >= 6 ? w.slice(0, 5) : w.slice(0, 4)));
}

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  один: 1,
  одну: 1,
  два: 2,
  две: 2,
  три: 3,
  четыре: 4,
  пять: 5,
  шесть: 6,
  семь: 7,
  восемь: 8,
  девять: 9,
  десять: 10,
};
const COUNT = `(\\d{1,3}|${Object.keys(NUMBER_WORDS).join('|')})?\\s*`;

function countOf(word: string | undefined): number {
  if (!word) return 1;
  const n = /^\d+$/.test(word) ? Number(word) : (NUMBER_WORDS[word] ?? 1);
  return n > 0 ? n : 1;
}

/** The days a question names, 'shift' for «за смену», null when it names no period. */
export function periodDays(q: string): number | 'shift' | null {
  const s = normalize(q);
  if (/квартал/.test(s)) return QUARTER_DAYS;
  if (/полгода|пол года/.test(s)) return 182;
  if (/(весь|все)\s+(время|период)|всю\s+историю/.test(s)) return MAX_PERIOD_DAYS;
  let m = new RegExp(`${COUNT}месяц`).exec(s);
  if (m) {
    const n = countOf(m[1]);
    return n === 3 ? QUARTER_DAYS : 30 * n;
  }
  m = new RegExp(`${COUNT}недел`).exec(s);
  if (m) return 7 * countOf(m[1]);
  m = /(\d{1,3})\s*(дн|день|сут)/.exec(s);
  if (m) return Number(m[1]);
  if (/сутк|сегодня|за день/.test(s)) return 1;
  if (/(^|[^\p{L}])год/u.test(s)) return 365;
  if (/смен[уыа]?([^\p{L}]|$)/u.test(s)) return 'shift';
  return null;
}

const FOCUS_WORDS: readonly (readonly [RegExp, Detector])[] = [
  [/оборудован|агрегат|узл[аоыу]|узел|ломает/, 'top_equipment'],
  [/участки|участков|участкам|сравн\S* участ/, 'top_areas'],
  [/повтор/, 'repeat_faults'],
  [/ппр|после планов/, 'post_ppr'],
  [/ноч|днем|пик|время суток|по часам/, 'time_patterns'],
  [/исполнител|слесар|ремонтник|работник|сотрудник/, 'worker_repeats'],
  [/материал|расход|смазк|списан/, 'materials'],
  [/рост|растет|тренд|прогноз|учащ/, 'trend'],
];

/** The keyword reader: the mock provider's parser and the fallback when Haiku fails. */
export function ruleReading(query: string, now: number, areas: readonly Area[]): QueryReading {
  const s = normalize(query);
  const area = areas.find((a) => areaStems(a.name).some((stem) => s.includes(stem)));
  const days = periodDays(s);
  const period =
    days === null
      ? null
      : days === 'shift'
        ? { from: shiftStart(now), to: now }
        : { from: now - days * DAY_MS, to: now };
  const focus = FOCUS_WORDS.filter(([re]) => re.test(s)).map(([, d]) => d);
  return { area_id: area?.id ?? null, period, focus: [...new Set(focus)] };
}

/** Haiku's answer checked: a known area id, a sane period that ends by now, detector kinds only. */
export function readingFromAnswer(
  a: ParseQueryAnswer,
  now: number,
  areas: readonly Area[],
): QueryReading {
  const areaId =
    typeof a.area_id === 'number' && areas.some((x) => x.id === a.area_id) ? a.area_id : null;
  const from = typeof a.from === 'string' ? Date.parse(a.from) : NaN;
  const to = typeof a.to === 'string' ? Date.parse(a.to) : NaN;
  const period = Number.isFinite(from)
    ? clampPeriod({ from, to: Number.isFinite(to) ? to : now }, now)
    : null;
  const focus = Array.isArray(a.focus) ? a.focus.filter(isDetector) : [];
  return { area_id: areaId, period, focus: [...new Set(focus)] };
}

/** The user message of the parse_query call. */
export function parseQueryMessage(query: string, now: number, areas: readonly Area[]): string {
  return [
    `Вопрос: «${query}»`,
    `Текущее время: ${qostanayIso(now)}`,
    'Участки (id и название):',
    ...areas.map((a) => `${a.id} ${a.name}`),
  ].join('\n');
}

// ---------------------------------------------------------------------------
// the scope
// ---------------------------------------------------------------------------

export function resolveScope(input: {
  period: Period;
  filters: InsightFilters;
  query: string | null;
  reading: QueryReading | null;
  parsedBy: ParsedBy | null;
  areas: readonly Area[];
}): Scope {
  const period = input.reading?.period ?? input.period;
  const filters: InsightFilters = { ...input.filters };
  if (input.reading?.area_id != null) filters.area_id = input.reading.area_id;
  const area =
    filters.area_id != null ? input.areas.find((a) => a.id === filters.area_id) : undefined;
  return {
    from: new Date(period.from).toISOString(),
    to: new Date(period.to).toISOString(),
    label: periodLabel(period.from, period.to),
    filters,
    area_name: area?.name ?? null,
    focus: input.reading?.focus ?? [],
    query: input.query,
    parsed_by: input.query ? input.parsedBy : null,
  };
}

/**
 * The cache key of a scope: period length in hours, where it ends ('now' for a rolling window), the filters and
 * the focus. Two phrasings of the same question share it; the raw text does not take part.
 */
export function cacheKey(scope: Scope, now: number, version: string): string {
  const from = Date.parse(scope.from);
  const to = Date.parse(scope.to);
  const span = Math.round((to - from) / HOUR_MS);
  const end =
    Math.abs(now - to) <= HOUR_MS ? 'now' : qostanayIso(Math.floor(to / HOUR_MS) * HOUR_MS);
  const f = scope.filters;
  const filters = [
    f.area_id != null ? `a${f.area_id}` : '',
    f.equipment_id != null ? `e${f.equipment_id}` : '',
    f.brigade_id != null ? `b${f.brigade_id}` : '',
    f.assignee_id ? `w${f.assignee_id}` : '',
  ]
    .filter(Boolean)
    .join(',');
  return [
    version,
    `${span}h`,
    end,
    filters || 'all',
    [...scope.focus].sort().join(',') || 'any',
  ].join('|');
}

/** How long cached cards answer the same scope: a tenth of the period, at most `cap` (rolling windows drift). */
export function cacheTtlMs(scope: Scope, capMs: number): number {
  const span = Date.parse(scope.to) - Date.parse(scope.from);
  return Math.max(60_000, Math.min(capMs, Math.round(span / 10)));
}
