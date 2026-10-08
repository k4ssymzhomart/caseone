// Order report logic (CLAUDE.md §11, §12), the same rules as the mobile review screens
// (apps/mobile/src/features/review/checks.ts): which review to show, waiting for the AI, work time against the
// norm, materials against the norm, the order's equipment downtime.
import {
  formatNumber,
  type AiCheck,
  type AiReview,
  type CheckStatus,
  type Order,
  type OrderDetail,
  type OrderMaterialView,
  type Tone,
  type WorkNorm,
} from '@rota/shared';

/** The attempt the AI checks now: rework_count + 1. */
export function currentAttempt(o: Pick<Order, 'rework_count'>): number {
  return o.rework_count + 1;
}

/** Waiting for the AI: done, or ai_review without a review row for the current attempt. */
export function isWaiting(d: OrderDetail): boolean {
  const o = d.order;
  if (o.status === 'done') return true;
  if (o.status !== 'ai_review') return false;
  return !d.reviews.some((r) => r.attempt === currentAttempt(o));
}

/**
 * The review to show. In ai_review it is the current attempt's; after a return the order is in rework and
 * rework_count already moved on, so the latest attempt is the one that sent it back.
 */
export function shownReview(d: OrderDetail): AiReview | null {
  if (isWaiting(d)) return null;
  if (d.order.status === 'ai_review') {
    return d.reviews.find((r) => r.attempt === currentAttempt(d.order)) ?? null;
  }
  let latest: AiReview | null = null;
  for (const r of d.reviews) if (!latest || r.attempt > latest.attempt) latest = r;
  return latest;
}

/** The check rows; an empty list when the jsonb is missing (never crash on a partial row). */
export function reviewChecks(review: Pick<AiReview, 'checks'>): AiCheck[] {
  return Array.isArray(review.checks) ? review.checks : [];
}

export function capitalize(s: string): string {
  const v = s.trim();
  return v ? v.charAt(0).toUpperCase() + v.slice(1) : v;
}

/** «нет фото после; перерасход …» → «Нет фото после. Перерасход …». */
export function checkMessage(message: string | null | undefined): string {
  if (!message) return '';
  return message
    .split(/;\s*/)
    .map(capitalize)
    .filter(Boolean)
    .join('. ');
}

export const CHECK_GLYPH: Readonly<Record<CheckStatus, string>> = { pass: '✓', warn: '!', fail: '✕', skipped: '…' };
export const CHECK_TONE: Readonly<Record<CheckStatus, Tone>> = {
  pass: 'success',
  warn: 'warning',
  fail: 'critical',
  skipped: 'off',
};

/** Work minutes: done − started − paused (R4). null while the work has no start or end. */
export function workMinutes(o: Pick<Order, 'started_at' | 'done_at' | 'paused_total_sec'>): number | null {
  if (!o.started_at || !o.done_at) return null;
  const ms = Date.parse(o.done_at) - Date.parse(o.started_at);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, ms / 60_000 - o.paused_total_sec / 60);
}

export function normFor(code: string | null | undefined, norms: readonly WorkNorm[]): WorkNorm | undefined {
  return code ? norms.find((n) => n.fault_code === code) : undefined;
}

/** The order's norm hours, else the norm of its fault code (or the suggested one). */
export function normHours(
  o: Pick<Order, 'norm_hours' | 'fault_code' | 'suggested_fault_code'>,
  norms: readonly WorkNorm[],
): number | null {
  if (o.norm_hours != null) return o.norm_hours;
  return normFor(o.fault_code ?? o.suggested_fault_code, norms)?.norm_hours ?? null;
}

/**
 * Equipment downtime of the order (CLAUDE.md §12): from issue until the work is done (or the order cancelled, or
 * now while it runs), only when the order stopped the unit. Same rule as equipment.history's total.
 */
export function orderDowntimeMinutes(
  o: Pick<Order, 'equipment_stopped' | 'created_at' | 'done_at' | 'cancelled_at'>,
  now: Date,
): number | null {
  if (!o.equipment_stopped) return null;
  const start = Date.parse(o.created_at);
  const endIso = o.done_at ?? o.cancelled_at;
  const end = endIso ? Date.parse(endIso) : now.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, (end - start) / 60_000);
}

export type MaterialVerdict = 'ok' | 'over' | 'not_typical' | 'no_norm';

export interface MaterialRow {
  line: OrderMaterialView;
  /** The norm's hard maximum for this material, when it is typical for the code. */
  max: number | null;
  verdict: MaterialVerdict;
}

/** Each closing line against the work norm of the fault code (R3: not typical → warn, over qty_max → fail). */
export function materialRows(lines: readonly OrderMaterialView[], norm: WorkNorm | undefined): MaterialRow[] {
  return lines.map((line) => {
    if (!norm) return { line, max: null, verdict: 'no_norm' };
    const typical = norm.typical.find((x) => x.material_id === line.material_id);
    if (!typical) return { line, max: null, verdict: 'not_typical' };
    return { line, max: typical.qty_max, verdict: line.qty > typical.qty_max ? 'over' : 'ok' };
  });
}

export const MATERIAL_TONE: Readonly<Record<MaterialVerdict, Tone>> = {
  ok: 'success',
  over: 'critical',
  not_typical: 'warning',
  no_norm: 'neutral',
};

/** «1,2» seconds. */
export function seconds(ms: number): string {
  return formatNumber(ms / 1000, 1);
}
