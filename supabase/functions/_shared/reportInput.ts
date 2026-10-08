// Inputs and answers of the two report functions (CLAUDE.md §13, §14), pure so vitest checks them:
// - ai-shift-summary: the request body, the report as plain Russian lines with every number the model may use
//   (workers by pseudonym only), the answer check, the 10 minute cache in ai_insights;
// - ai-explain-rating: the request body, the worker's row against the team medians, the answer check.
// No Deno or Node globals, no imports outside this folder.

import {
  COMPONENT_LABEL,
  formatDuration,
  formatNumber,
  plural,
  RATING_COMPONENTS,
  RATING_WEIGHTS,
  REJECT_REASON_LABEL,
  toNumber,
  toNumberOrNull,
  type PeriodData,
  type RatingComponent,
  type RatingRowData,
  type ReportFiltersData,
  type ShiftReportData,
  type ShiftSummaryText,
} from './reportText.ts';

export type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 86_400_000;
/** The longest report window a caller may ask for (the history holds 92 days). */
export const MAX_PERIOD_DAYS = 400;

// ---------------------------------------------------------------------------
// request bodies
// ---------------------------------------------------------------------------

/** An ISO timestamp, normalized to toISOString(); null when it does not parse. */
export function parseIso(value: unknown): string | null {
  if (typeof value !== 'string' || value.length < 10 || value.length > 40) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function parsePeriod(body: { from?: unknown; to?: unknown }): ParseResult<PeriodData> {
  const from = parseIso(body.from);
  const to = parseIso(body.to);
  if (!from || !to) return { ok: false, message: 'from and to: ISO timestamps expected' };
  const span = Date.parse(to) - Date.parse(from);
  if (span <= 0) return { ok: false, message: 'from must be before to' };
  if (span > MAX_PERIOD_DAYS * DAY_MS)
    return { ok: false, message: `the period is longer than ${MAX_PERIOD_DAYS} days` };
  return { ok: true, value: { from, to } };
}

const positiveInt = (v: unknown): number | null =>
  typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? v : null;

/** The shared report filter: only its four keys, each of the right type; null or absent means «all». */
export function parseFilters(raw: unknown): ParseResult<ReportFiltersData> {
  if (raw == null) return { ok: true, value: {} };
  if (typeof raw !== 'object' || Array.isArray(raw))
    return { ok: false, message: 'filters: object expected' };
  const f = raw as Record<string, unknown>;
  const out: ReportFiltersData = {};
  for (const key of ['area_id', 'equipment_id', 'brigade_id'] as const) {
    if (f[key] == null) continue;
    const n = positiveInt(f[key]);
    if (n == null) return { ok: false, message: `filters.${key}: positive integer expected` };
    out[key] = n;
  }
  if (f.assignee_id != null) {
    if (typeof f.assignee_id !== 'string' || !UUID.test(f.assignee_id))
      return { ok: false, message: 'filters.assignee_id: uuid expected' };
    out.assignee_id = f.assignee_id.toLowerCase();
  }
  return { ok: true, value: out };
}

/** What a summary is about: the window and the filter (ai_insights.scope). */
export interface SummaryScope {
  from: string;
  to: string;
  filters: ReportFiltersData;
}

export interface SummaryRequest {
  scope: SummaryScope;
  /** «Обновить»: a cached summary older than SUMMARY_REFRESH_TTL_MS is not reused. */
  refresh: boolean;
}

/** POST {from, to, filters?, refresh?} of ai-shift-summary. */
export function parseSummaryBody(body: unknown): ParseResult<SummaryRequest> {
  if (body == null || typeof body !== 'object' || Array.isArray(body))
    return { ok: false, message: 'JSON body {from, to, filters} expected' };
  const b = body as Record<string, unknown>;
  const period = parsePeriod(b);
  if (!period.ok) return period;
  const filters = parseFilters(b.filters);
  if (!filters.ok) return filters;
  return {
    ok: true,
    value: { scope: { ...period.value, filters: filters.value }, refresh: b.refresh === true },
  };
}

export interface ExplainRequest {
  employee_id: string;
  period: PeriodData;
}

/** POST {employee_id, from, to} of ai-explain-rating. */
export function parseExplainBody(body: unknown): ParseResult<ExplainRequest> {
  if (body == null || typeof body !== 'object' || Array.isArray(body))
    return { ok: false, message: 'JSON body {employee_id, from, to} expected' };
  const b = body as Record<string, unknown>;
  if (typeof b.employee_id !== 'string' || !UUID.test(b.employee_id))
    return { ok: false, message: 'employee_id: uuid expected' };
  const period = parsePeriod(b);
  if (!period.ok) return period;
  return { ok: true, value: { employee_id: b.employee_id.toLowerCase(), period: period.value } };
}

// ---------------------------------------------------------------------------
// local time (Asia/Qostanay, fixed UTC+5)
// ---------------------------------------------------------------------------

const OFFSET_MS = 5 * 3600_000;
const pad2 = (n: number): string => String(n).padStart(2, '0');

function local(iso: string | Date): Date {
  const ms = typeof iso === 'string' ? Date.parse(iso) : iso.getTime();
  return new Date(ms + OFFSET_MS);
}

/** «08:00 09.10.2026» in Asia/Qostanay. */
export function localStamp(iso: string | Date): string {
  const d = local(iso);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())} ${localDate(iso)}`;
}

/** «09.10.2026» in Asia/Qostanay. */
export function localDate(iso: string | Date): string {
  const d = local(iso);
  return `${pad2(d.getUTCDate())}.${pad2(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}

/** «дневная смена» or «ночная смена» when the window starts at 08:00 or 20:00 and is at most 12 hours long. */
export function shiftLabel(period: PeriodData): string | null {
  const start = local(period.from);
  const span = Date.parse(period.to) - Date.parse(period.from);
  if (span > 12 * 3600_000 + 60_000 || start.getUTCMinutes() !== 0) return null;
  if (start.getUTCHours() === 8) return 'дневная смена';
  if (start.getUTCHours() === 20) return 'ночная смена';
  return null;
}

// ---------------------------------------------------------------------------
// shift summary: the message
// ---------------------------------------------------------------------------

export interface FilterNames {
  area?: string | null;
  equipment?: string | null;
  brigade?: string | null;
  /** The assignee's pseudonym (E01), never the name. */
  assignee?: string | null;
}

export interface SummaryInputContext {
  scope: SummaryScope;
  now: Date;
  names: FilterNames;
  /** employee_id → pseudonym: the workload goes out with pseudonyms only. */
  pseudonyms: ReadonlyMap<string, string>;
}

const VERDICT_TEXT: Readonly<Record<string, string>> = {
  accepted: 'принято',
  accepted_with_remarks: 'принято с замечаниями',
  rework: 'на доработку',
};

const share = (x: number): string => `${Math.round(x * 100)}%`;

/** «Фильтр: участок «…», оборудование «…».» or «Фильтр: все участки, всё оборудование и все исполнители.» */
export function filterLine(filters: ReportFiltersData, names: FilterNames): string {
  const parts: string[] = [];
  if (filters.area_id != null) parts.push(`участок «${names.area ?? `№${filters.area_id}`}»`);
  if (filters.equipment_id != null)
    parts.push(`оборудование «${names.equipment ?? `№${filters.equipment_id}`}»`);
  if (filters.brigade_id != null) parts.push(`бригада «${names.brigade ?? `№${filters.brigade_id}`}»`);
  if (filters.assignee_id != null) parts.push(`исполнитель ${names.assignee ?? 'из фильтра'}`);
  return parts.length > 0
    ? `Фильтр: ${parts.join(', ')}.`
    : 'Фильтр: все участки, всё оборудование и все исполнители.';
}

/** The pseudonyms the workload needs; null when one of them is missing (no call goes out then). */
export function workloadCovered(
  report: Pick<ShiftReportData, 'workload'>,
  pseudonyms: ReadonlyMap<string, string>,
): boolean {
  return report.workload.every((w) => !!pseudonyms.get(w.employee_id));
}

/**
 * The report as Russian lines, each number written once the way the model may repeat it. Workers appear by
 * pseudonym only; equipment, areas and fault codes are not personal data.
 */
export function buildShiftSummaryText(report: ShiftReportData, ctx: SummaryInputContext): string {
  const c = report.counts;
  const n = (v: unknown): number => toNumber(v);
  const lines: string[] = [];
  const shift = shiftLabel(ctx.scope);
  const endsLater = Date.parse(ctx.scope.to) > ctx.now.getTime() + 60_000;
  lines.push(
    `Отчёт службы ремонта за период с ${localStamp(ctx.scope.from)} по ${localStamp(
      endsLater ? ctx.now : ctx.scope.to,
    )} (время Костаная)${shift ? `, ${shift}` : ''}.` +
      (endsLater ? ' Период ещё идёт, числа на текущий момент.' : ''),
  );
  lines.push(filterLine(ctx.scope.filters, ctx.names));
  lines.push('');
  lines.push(
    `Наряды за период: выдано ${n(c.issued)}, принято в работу ${n(c.accepted)}, исполнено ${n(
      c.done,
    )}, закрыто ${n(c.closed)}, просрочено ${n(c.overdue)}, отклонено ${n(
      c.rejected,
    )}, возвращено на доработку ${n(c.rework)}, отменено ${n(c.cancelled)}.`,
  );
  lines.push(`Активных нарядов сейчас: ${n(c.active_now)}.`);

  const reasons = report.rejected_reasons.filter((r) => n(r.count) > 0);
  lines.push(
    reasons.length > 0
      ? `Причины отказов: ${reasons
          .map(
            (r) =>
              `${r.reason ? (REJECT_REASON_LABEL[r.reason] ?? r.reason) : 'без причины'} ${n(r.count)}`,
          )
          .join(', ')}.`
      : 'Отказов от нарядов не было.',
  );

  const reaction = toNumberOrNull(report.reaction_avg_min);
  const execution = toNumberOrNull(report.execution_avg_min);
  const onTime = toNumberOrNull(report.on_time_share);
  lines.push(
    reaction != null
      ? `Среднее время реакции, от выдачи до принятия: ${formatNumber(reaction)} мин.`
      : 'Среднее время реакции: нет данных.',
  );
  lines.push(
    execution != null
      ? `Среднее время выполнения, от начала до исполнения без пауз: ${formatDuration(execution)}.`
      : 'Среднее время выполнения: нет данных.',
  );
  lines.push(
    onTime != null
      ? `Выполнено в срок: ${share(onTime)} нарядов, исполненных за период.`
      : 'Выполнено в срок: нет данных.',
  );

  const down = report.downtime.slice(0, 5);
  lines.push(
    down.length > 0
      ? `Простой оборудования по нарядам с остановкой: всего ${formatNumber(
          n(report.downtime_hours),
        )} ч. ${down
          .map(
            (d) =>
              `${d.name}: ${formatNumber(n(d.hours))} ч, ${n(d.orders)} ${plural(
                n(d.orders),
                ['наряд', 'наряда', 'нарядов'],
              )}`,
          )
          .join('; ')}.`
      : 'Простоя оборудования за период не было.',
  );

  const busy = report.workload.slice(0, 8);
  lines.push(
    busy.length > 0
      ? `Загрузка исполнителей, время в работе по нарядам и доля смены: ${busy
          .map(
            (w) =>
              `${ctx.pseudonyms.get(w.employee_id) ?? 'исполнитель'} ${formatDuration(
                n(w.busy_min),
              )}, ${share(n(w.share))}`,
          )
          .join('; ')}.`
      : 'За период никто не работал по нарядам.',
  );

  const verdicts = (['accepted', 'accepted_with_remarks', 'rework'] as const).map(
    (v) => `${VERDICT_TEXT[v]} ${n(report.verdicts[v])}`,
  );
  const reviewed = (['accepted', 'accepted_with_remarks', 'rework'] as const).reduce(
    (s, v) => s + n(report.verdicts[v]),
    0,
  );
  lines.push(
    reviewed > 0
      ? `Проверка ИИ: ${verdicts.join(', ')}. Оценку ИИ изменил мастер: ${n(report.master_overrides)}.`
      : 'Проверок ИИ за период не было.',
  );

  const issues = report.top_issues.slice(0, 5);
  lines.push(
    issues.length > 0
      ? `Частые неисправности во внеплановых нарядах: ${issues
          .map((i) => `${i.code}${i.name ? ` ${i.name}` : ''}, ${n(i.count)}`)
          .join('; ')}.`
      : 'Внеплановых нарядов с шифром не было.',
  );
  const units = report.top_equipment.slice(0, 5);
  lines.push(
    units.length > 0
      ? `Чаще всего ломалось, внеплановых нарядов: ${units
          .map((u) => `${u.name} ${n(u.count)}`)
          .join('; ')}.`
      : 'Внеплановых отказов оборудования не было.',
  );
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// answers
// ---------------------------------------------------------------------------

/**
 * Spaced dashes as punctuation become commas (the UI copy rule); codes like «М-02» keep their hyphen. A short name
 * put back at the end of a sentence («с E02.» → «с Иванов С..») loses the second period.
 */
export function cleanText(text: string): string {
  return text
    .replace(/(\s\p{Lu}\.)\./gu, '$1')
    .replace(/\s+[—–‒―]\s+/g, ', ')
    .replace(/\s+-\s+/g, ', ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
}

/**
 * The summary as shown: trimmed, cleaned, exactly 3 recommendations (missing ones from the rules text).
 * null when the answer is unusable (no summary or no recommendation at all).
 */
export function normalizeShiftSummary(
  answer: unknown,
  rules: ShiftSummaryText,
): ShiftSummaryText | null {
  const a = (answer ?? {}) as { summary?: unknown; recommendations?: unknown };
  const summary = typeof a.summary === 'string' ? cleanText(a.summary) : '';
  if (summary.length < 40) return null;
  const recs = (Array.isArray(a.recommendations) ? a.recommendations : [])
    .filter((r): r is string => typeof r === 'string')
    .map(cleanText)
    .filter((r) => r.length > 0)
    .slice(0, 3);
  if (recs.length === 0) return null;
  for (const r of rules.recommendations) {
    if (recs.length >= 3) break;
    if (!recs.includes(r)) recs.push(r);
  }
  return { summary, recommendations: recs };
}

/** The explanation as shown; null when it is too short to be three sentences. */
export function normalizeExplanation(answer: unknown): string | null {
  const text = (answer as { text?: unknown } | null)?.text;
  if (typeof text !== 'string') return null;
  const clean = cleanText(text);
  return clean.length >= 40 ? clean : null;
}

/** Every number written in a text, normalized («4,2» → «4.2», «05» → «5»). */
export function numbersIn(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((tok) => String(Number(tok.replace(',', '.'))));
}

/**
 * Numbers of the answer that the input never wrote: a cheap signal of invented figures. Reported in the
 * response and the logs; the master still reads the report numbers next to the summary.
 */
export function unknownNumbers(output: string, input: string): string[] {
  const known = new Set(numbersIn(input));
  return [...new Set(numbersIn(output))].filter((x) => !known.has(x));
}

// ---------------------------------------------------------------------------
// the ai_insights cache
// ---------------------------------------------------------------------------

/** A stored summary is reused for this long (CLAUDE.md §14: cached in ai_insights). */
export const SUMMARY_CACHE_TTL_MS = 10 * 60_000;
/** «Обновить» reuses only a summary this fresh. */
export const SUMMARY_REFRESH_TTL_MS = 60_000;
/** Rolling windows move every minute: ends within this distance are the same scope. */
export const SCOPE_TOLERANCE_MS = 10 * 60_000;

export interface CachedSummaryRow {
  id?: number;
  created_at: string;
  scope: unknown;
  body: string | null;
  recommendation: string | null;
  evidence: unknown;
}

export interface CachedSummary extends ShiftSummaryText {
  model: string;
  created_at: string;
}

export function sameFilters(a: ReportFiltersData, b: ReportFiltersData): boolean {
  return (
    (a.area_id ?? null) === (b.area_id ?? null) &&
    (a.equipment_id ?? null) === (b.equipment_id ?? null) &&
    (a.brigade_id ?? null) === (b.brigade_id ?? null) &&
    (a.assignee_id ?? null) === (b.assignee_id ?? null)
  );
}

/** The newest stored summary of the same scope created within ttlMs, or null. */
export function matchCachedSummary(
  rows: readonly CachedSummaryRow[],
  scope: SummaryScope,
  now: Date,
  ttlMs: number,
): CachedSummary | null {
  const near = (a: unknown, b: string): boolean => {
    const x = typeof a === 'string' ? Date.parse(a) : NaN;
    return Number.isFinite(x) && Math.abs(x - Date.parse(b)) <= SCOPE_TOLERANCE_MS;
  };
  const fresh = rows
    .filter((r) => {
      const age = now.getTime() - Date.parse(r.created_at);
      return Number.isFinite(age) && age >= -60_000 && age <= ttlMs;
    })
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  for (const r of fresh) {
    const s = (r.scope ?? {}) as { from?: unknown; to?: unknown; filters?: unknown };
    const filters = parseFilters(s.filters);
    if (!filters.ok || !sameFilters(filters.value, scope.filters)) continue;
    if (!near(s.from, scope.from) || !near(s.to, scope.to)) continue;
    const ev = (r.evidence ?? {}) as { recommendations?: unknown; model?: unknown };
    const recs = Array.isArray(ev.recommendations)
      ? ev.recommendations.filter((x): x is string => typeof x === 'string' && x.length > 0)
      : (r.recommendation ?? '').split('\n').filter((x) => x.trim().length > 0);
    if (!r.body || recs.length === 0) continue;
    return {
      summary: r.body,
      recommendations: recs.slice(0, 3),
      model: typeof ev.model === 'string' ? ev.model : 'unknown',
      created_at: r.created_at,
    };
  }
  return null;
}

export interface SummaryInsightRow {
  kind: 'shift_summary';
  severity: 'info';
  title: string;
  body: string;
  recommendation: string;
  scope: SummaryScope;
  evidence: {
    order_ids: number[];
    stats: Record<string, number>;
    recommendations: string[];
    model: string;
    source: 'llm';
    unknown_numbers: string[];
  };
}

/** The ai_insights row that caches one LLM summary (kind shift_summary). */
export function summaryInsightRow(
  scope: SummaryScope,
  text: ShiftSummaryText,
  report: Pick<ShiftReportData, 'counts'>,
  meta: { model: string; unknown_numbers: string[] },
): SummaryInsightRow {
  const stats: Record<string, number> = {};
  for (const [k, v] of Object.entries(report.counts ?? {})) stats[k] = toNumber(v);
  const shift = shiftLabel(scope);
  return {
    kind: 'shift_summary',
    severity: 'info',
    title: `Сводка ИИ${shift ? `, ${shift}` : ''} с ${localStamp(scope.from)}`,
    body: text.summary,
    recommendation: text.recommendations.join('\n'),
    scope,
    evidence: {
      order_ids: [],
      stats,
      recommendations: text.recommendations,
      model: meta.model,
      source: 'llm',
      unknown_numbers: meta.unknown_numbers,
    },
  };
}

// ---------------------------------------------------------------------------
// rating explanation: the input
// ---------------------------------------------------------------------------

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const xs = [...values].sort((a, b) => a - b);
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 === 1 ? (xs[mid] as number) : ((xs[mid - 1] as number) + (xs[mid] as number)) / 2;
}

export interface RatingContext {
  row: RatingRowData;
  /** Workers with a score in the period (the rank is among them). */
  ranked: number;
  /** Medians of the scored workers, per component. */
  team: Record<RatingComponent, number | null>;
  /** weight × (worker − team median) × 100: rating points above (+) or below (−) the team. */
  gaps: Record<RatingComponent, number | null>;
  helped: RatingComponent | null;
  hurt: RatingComponent | null;
}

/** The worker's row of public.rating() against the team; null when the employee has no worker row. */
export function ratingContext(
  rows: readonly RatingRowData[],
  employeeId: string,
): RatingContext | null {
  const workers = rows.filter((r) => r.kind === 'worker');
  const row = workers.find((r) => r.id.toLowerCase() === employeeId.toLowerCase());
  if (!row) return null;
  const scored = workers.filter((r) => toNumberOrNull(r.score) != null);
  const team = {} as Record<RatingComponent, number | null>;
  const gaps = {} as Record<RatingComponent, number | null>;
  let helped: RatingComponent | null = null;
  let hurt: RatingComponent | null = null;
  for (const k of RATING_COMPONENTS) {
    const values = scored.map((r) => toNumberOrNull(r[k])).filter((x): x is number => x != null);
    team[k] = median(values);
    const own = toNumberOrNull(row[k]);
    const m = team[k];
    // rounded twice, so 0.95 − 0.9 counts as 0.05 and not 0.0499…
    gaps[k] =
      own != null && m != null
        ? Math.round(RATING_WEIGHTS[k] * (Math.round((own - m) * 1e6) / 1e6) * 1000) / 10
        : null;
    const g = gaps[k];
    if (g == null) continue;
    if (helped == null || g > (gaps[helped] ?? -Infinity)) helped = k;
    if (hurt == null || g < (gaps[hurt] ?? Infinity)) hurt = k;
  }
  return { row, ranked: scored.length, team, gaps, helped, hurt };
}

const COMPONENT_SHORT: Readonly<Record<RatingComponent, string>> = {
  q: 'Q качество',
  t: 'T в срок',
  f: 'F с первого раза',
  v: 'V объём и сложность',
  d: 'D дисциплина',
};

/** «2,5 балла», «5 баллов», «1 балл». */
function points(x: number): string {
  const abs = Math.abs(x);
  const text = formatNumber(abs);
  if (!Number.isInteger(Math.round(abs * 10) / 10)) return `${text} балла`;
  return `${text} ${plural(Math.round(abs), ['балл', 'балла', 'баллов'])}`;
}

function gapText(g: number): string {
  if (Math.abs(g) < 0.05) return 'на уровне команды';
  return g > 0 ? `на ${points(g)} выше команды` : `на ${points(g)} ниже команды`;
}

/**
 * The worker's components as Russian lines, without the name: value, team median, the points each component adds
 * to the score and the gap to the team in rating points, then which component helps and which hurts most.
 */
export function buildExplainText(ctx: RatingContext, period: PeriodData): string {
  const r = ctx.row;
  const lines: string[] = [];
  lines.push(`Период рейтинга: с ${localDate(period.from)} по ${localDate(period.to)}.`);
  lines.push(
    `Рейтинг исполнителя: ${formatNumber(toNumber(r.score))} из 100, место ${r.rank} из ${ctx.ranked} исполнителей с закрытыми нарядами, закрыто нарядов ${toNumber(r.closed)}.`,
  );
  lines.push(
    'Компоненты: значение исполнителя; медиана команды; баллы рейтинга из максимума; отклонение от команды.',
  );
  for (const k of RATING_COMPONENTS) {
    const own = toNumberOrNull(r[k]);
    const m = ctx.team[k];
    const max = RATING_WEIGHTS[k] * 100;
    const g = ctx.gaps[k];
    lines.push(
      `${COMPONENT_SHORT[k]}: ${own == null ? 'нет данных' : share(own)}; команда ${
        m == null ? 'нет данных' : share(m)
      }; ${own == null ? 0 : formatNumber(Math.round(max * own * 1e6) / 1e6)} из ${formatNumber(max)}; ${
        g == null ? 'нет данных' : gapText(g)
      }.`,
    );
  }
  const helped = ctx.helped;
  const hurt = ctx.hurt;
  if (helped && hurt && helped !== hurt) {
    lines.push(
      `Больше всего помогает: ${COMPONENT_LABEL[helped]}. Больше всего мешает: ${COMPONENT_LABEL[hurt]}.`,
    );
  } else if (hurt) {
    lines.push(`Больше всего мешает: ${COMPONENT_LABEL[hurt]}.`);
  }
  return lines.join('\n');
}
