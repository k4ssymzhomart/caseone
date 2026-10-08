// Deterministic report texts (CLAUDE.md §13, §14): the shift summary and the rating explanation written from the
// report numbers alone. ai-shift-summary and ai-explain-rating answer with them when the LLM is off (mock provider),
// fails or is over budget. packages/shared/src/api/mock/ai.ts has the same writers for MockApi and the SupabaseApi
// fallback; packages/shared/src/api/mock/reportText.parity.test.ts keeps both texts identical.
// No Deno or Node globals, no imports outside this folder: the file is deployed with the functions.

/** A time window, ISO timestamps, `to` exclusive. */
export interface PeriodData {
  from: string;
  to: string;
}

/** The shared report filter (one jsonb in every report RPC). */
export interface ReportFiltersData {
  area_id?: number;
  equipment_id?: number;
  assignee_id?: string;
  brigade_id?: number;
}

/** jsonb of public.shift_report() (packages/shared ShiftReport). */
export interface ShiftReportData {
  period?: PeriodData;
  counts: {
    issued: number;
    accepted: number;
    done: number;
    closed: number;
    overdue: number;
    rejected: number;
    rework: number;
    cancelled: number;
    active_now: number;
  };
  rejected_reasons: { reason: string | null; count: number }[];
  workload: { employee_id: string; short_name: string; busy_min: number; share: number }[];
  downtime: { equipment_id: number; name: string; hours: number; orders: number }[];
  downtime_hours: number;
  reaction_avg_min: number | null;
  execution_avg_min: number | null;
  on_time_share: number | null;
  verdicts: Partial<Record<'accepted' | 'accepted_with_remarks' | 'rework', number>>;
  master_overrides: number;
  top_issues: { code: string; name: string | null; count: number }[];
  top_equipment: { equipment_id: number; name: string; count: number }[];
}

/** A row of public.rating() (packages/shared RatingRow). Worker rows carry the uuid as id. */
export interface RatingRowData {
  kind: 'worker' | 'brigade';
  id: string;
  name: string;
  brigade_id: number | null;
  closed: number;
  q: number | null;
  t: number | null;
  f: number | null;
  v: number | null;
  d: number | null;
  score: number | null;
  rank: number;
  note: string | null;
}

export interface ShiftSummaryText {
  summary: string;
  recommendations: string[];
}

// ---------------------------------------------------------------------------
// formatting (the same rules as packages/shared/src/format)
// ---------------------------------------------------------------------------

export type PluralForms = readonly [one: string, few: string, many: string];

export const ORDER_FORMS: PluralForms = ['наряд', 'наряда', 'нарядов'];

export function plural(n: number, forms: PluralForms): string {
  const abs = Math.abs(Math.trunc(n));
  const mod100 = abs % 100;
  const mod10 = abs % 10;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

/** Decimal comma, up to `digits` fraction digits, no trailing zeros: 4.7 → «4,7», 2 → «2». */
export function formatNumber(value: number, digits = 1): string {
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  return String(rounded).replace('.', ',');
}

/** «45 мин», «2 ч», «2 ч 10 мин». */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total} мин`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
}

export const REJECT_REASON_LABEL: Readonly<Record<string, string>> = {
  no_materials: 'Нет материалов',
  no_permit: 'Нет допуска',
  busy_emergency: 'Занят аварийным',
  equipment_running: 'Оборудование работает',
  other: 'Другое',
};

/** A number from a jsonb or numeric column (PostgREST may send numeric as text), else the fallback. */
export function toNumber(value: unknown, fallback = 0): number {
  if (value == null || value === '') return fallback;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Like toNumber, but null stays null. */
export function toNumberOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

const lowerFirst = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

// ---------------------------------------------------------------------------
// shift summary
// ---------------------------------------------------------------------------

/** 5 to 8 sentences and 3 recommendations from the shift report numbers, in the case's plain tone. */
export function templateShiftSummary(report: ShiftReportData): ShiftSummaryText {
  const c = report.counts;
  const sentences: string[] = [];
  sentences.push(
    `За период выдано ${c.issued} ${plural(c.issued, ORDER_FORMS)}, выполнено ${c.done}, закрыто ${c.closed}.`,
  );
  sentences.push(
    c.overdue > 0
      ? `Просрочено ${c.overdue} ${plural(c.overdue, ORDER_FORMS)}, в работе сейчас ${c.active_now}.`
      : `Просрочек нет, в работе сейчас ${c.active_now} ${plural(c.active_now, ORDER_FORMS)}.`,
  );
  if (report.reaction_avg_min != null || report.execution_avg_min != null) {
    const parts: string[] = [];
    if (report.reaction_avg_min != null)
      parts.push(`реакция в среднем ${formatNumber(report.reaction_avg_min)} мин`);
    if (report.execution_avg_min != null)
      parts.push(`выполнение ${formatDuration(report.execution_avg_min)}`);
    sentences.push(`${parts.join(', ').replace(/^./, (x) => x.toUpperCase())}.`);
  }
  const topDown = report.downtime[0];
  sentences.push(
    topDown
      ? `Простой оборудования ${formatNumber(report.downtime_hours)} ч, дольше всех стоял ${topDown.name}.`
      : 'Простоя оборудования за период не было.',
  );
  const v = report.verdicts;
  const accepted = v.accepted ?? 0;
  const remarks = v.accepted_with_remarks ?? 0;
  const rework = v.rework ?? 0;
  if (accepted + remarks + rework > 0) {
    sentences.push(
      `ИИ принял ${accepted}, с замечаниями ${remarks}, вернул на доработку ${rework}.`,
    );
  } else {
    sentences.push('Проверок ИИ за период не было.');
  }
  const issue = report.top_issues[0];
  if (issue)
    sentences.push(
      `Чаще всего встречался шифр ${issue.code}${issue.name ? ` (${lowerFirst(issue.name)})` : ''}.`,
    );
  const reason = report.rejected_reasons[0];
  if (c.rejected > 0 && reason) {
    const label = reason.reason
      ? (REJECT_REASON_LABEL[reason.reason] ?? reason.reason)
      : 'без причины';
    sentences.push(`Отказов от нарядов ${c.rejected}, чаще всего: ${lowerFirst(label)}.`);
  }
  const busiest = report.workload[0];
  if (busiest)
    sentences.push(
      `Больше всех загружен ${busiest.short_name}: ${Math.round(busiest.share * 100)}% времени.`,
    );

  const recs: string[] = [];
  if (c.overdue > 0)
    recs.push('Разберите просроченные наряды с исполнителями и проверьте нормативы времени.');
  if (topDown)
    recs.push(`Включите ${topDown.name} в план ППР и проверьте запас запчастей для него.`);
  if (rework > 0 || c.rework > 0)
    recs.push('Напомните исполнителям про фото после и списание материалов по норме.');
  if (c.rejected > 0) recs.push('Проверьте допуски и наличие материалов до выдачи нарядов.');
  for (const fallback of [
    'Закрывайте наряды в течение смены, чтобы отчёт был полным.',
    'Проверьте план ППР на следующую смену.',
    'Отметьте лучших исполнителей смены.',
  ]) {
    if (recs.length >= 3) break;
    recs.push(fallback);
  }
  return { summary: sentences.slice(0, 8).join(' '), recommendations: recs.slice(0, 3) };
}

// ---------------------------------------------------------------------------
// rating explanation
// ---------------------------------------------------------------------------

export type RatingComponent = 'q' | 't' | 'f' | 'v' | 'd';
export const RATING_COMPONENTS: readonly RatingComponent[] = ['q', 't', 'f', 'v', 'd'];
export const RATING_WEIGHTS: Readonly<Record<RatingComponent, number>> = {
  q: 0.35,
  t: 0.25,
  f: 0.2,
  v: 0.1,
  d: 0.1,
};

export const COMPONENT_LABEL: Readonly<Record<RatingComponent, string>> = {
  q: 'качество работ',
  t: 'соблюдение сроков',
  f: 'ремонт с первого раза',
  v: 'объём и сложность',
  d: 'дисциплина',
};

const COMPONENT_ACTION: Readonly<Record<RatingComponent, string>> = {
  q: 'Подробнее описывайте работы и прикладывайте фото после, тогда оценка ИИ будет выше.',
  t: 'Принимайте наряды сразу и предупреждайте мастера, если не успеваете к сроку.',
  f: 'Ищите причину неисправности, а не только следствие, чтобы узел не ломался повторно.',
  v: 'Берите сложные и аварийные наряды, когда свободны.',
  d: 'Указывайте точную причину отказа от наряда вместо «Другое».',
};

export const NO_RATING_TEXT =
  'Закрытых нарядов за период нет, поэтому рейтинг не рассчитан. Закройте несколько нарядов, и ИИ разберёт результат. Начните с нарядов в очереди.';

/** Three sentences: what helped, what hurt, one concrete action. */
export function templateExplainRating(row: RatingRowData | undefined): string {
  if (!row || row.score == null) return NO_RATING_TEXT;
  const parts = RATING_COMPONENTS.map((k) => ({ k, v: toNumber(row[k]) }));
  const best = parts.reduce((a, b) => (b.v > a.v ? b : a));
  const worst = parts.reduce((a, b) => (b.v < a.v ? b : a));
  const pct = (x: number): string => `${Math.round(x * 100)}%`;
  return (
    `Сильнее всего рейтинг поднимает ${COMPONENT_LABEL[best.k]}: ${pct(best.v)}. ` +
    `Ниже всего ${COMPONENT_LABEL[worst.k]}: ${pct(worst.v)}. ` +
    COMPONENT_ACTION[worst.k]
  );
}
