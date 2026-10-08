// Review logic shared by the worker and master views: which review to show, the check list mapping,
// worker feedback bullets, work time against the norm, verdict looks (CLAUDE.md §11, §12).
import type { MascotName } from '@rota/design';
import {
  VERDICT_LABEL,
  formatDuration,
  formatNumber,
  formatPercent,
  verdictTone,
  type AiCheck,
  type AiReview,
  type Order,
  type OrderDetail,
  type Verdict,
  type WorkNorm,
} from '@rota/shared';

import { t } from '@/lib/i18n';
import type { CheckRowProps } from '@/ui/CheckRow';
import type { VerdictTone } from '@/ui/ScoreBadge';

/** The attempt that the AI is checking now (CLAUDE.md §11: attempt = rework_count + 1). */
export function currentAttempt(o: Pick<Order, 'rework_count'>): number {
  return o.rework_count + 1;
}

/** Waiting for the AI: done, or ai_review without a review row for the current attempt. */
export function isWaiting(d: OrderDetail | undefined): boolean {
  if (!d) return false;
  const o = d.order;
  if (o.status === 'done') return true;
  if (o.status !== 'ai_review') return false;
  return !d.reviews.some((r) => r.attempt === currentAttempt(o));
}

/**
 * The review to show. In ai_review it is the current attempt's; after an AI or master return the order is in
 * rework and rework_count already moved on, so the latest attempt is the one that sent it back.
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

export function toVerdictTone(v: Verdict): VerdictTone {
  return verdictTone(v) as VerdictTone;
}

export function verdictLabel(v: Verdict): string {
  return VERDICT_LABEL[v];
}

/** Server rule for a score without an override: ≥ 80 accepted, 60..79 with remarks, below rework. */
export function verdictForScore(score: number): Verdict {
  if (score >= 80) return 'accepted';
  if (score >= 60) return 'accepted_with_remarks';
  return 'rework';
}

export function capitalize(s: string): string {
  const v = s.trim();
  return v ? v.charAt(0).toUpperCase() + v.slice(1) : v;
}

/** «нет фото после; перерасход …» → ['Нет фото после', 'Перерасход …']. */
export function splitMessages(message: string | null | undefined): string[] {
  if (!message) return [];
  return message
    .split(/;\s*/)
    .map(capitalize)
    .filter(Boolean);
}

function unique(list: string[]): string[] {
  return [...new Set(list)];
}

/** The check rows of a review; an empty list when the jsonb is missing (never crash on a partial row). */
export function reviewChecks(review: Pick<AiReview, 'checks'>): AiCheck[] {
  return Array.isArray(review.checks) ? review.checks : [];
}

/**
 * Equipment downtime of this order (CLAUDE.md §12 master view): from issue until the work is done (or the
 * order closed or cancelled, or now while it runs), only when the order stopped the unit. null otherwise.
 */
export function downtimeMinutes(
  o: Pick<Order, 'equipment_stopped' | 'created_at' | 'done_at' | 'closed_at' | 'cancelled_at'>,
  now: Date = new Date(),
): number | null {
  if (!o.equipment_stopped) return null;
  const start = Date.parse(o.created_at);
  const endIso = o.done_at ?? o.closed_at ?? o.cancelled_at;
  const end = endIso ? Date.parse(endIso) : now.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, (end - start) / 60_000);
}

/** «Что хорошо» and «Что улучшить». A rules only review may carry empty lists: derive them from the checks. */
export function workerFeedback(review: AiReview): { good: string[]; improve: string[] } {
  const fb = review.feedback_worker;
  let good = unique((fb?.good ?? []).map(capitalize).filter(Boolean));
  let improve = unique((fb?.improve ?? []).flatMap(splitMessages));
  const checks = reviewChecks(review).filter((c) => c.status !== 'skipped');
  if (good.length === 0) {
    good = checks.filter((c) => c.status === 'pass').map((c) => t('review.goodCheck', { title: c.title }));
  }
  // Failed rules always lead the list: they are the reasons for a rework (CLAUDE.md §11, demo step 7: «нет фото
  // после» and «перерасход»), whatever the LLM wrote. Warnings fill in when the LLM gave no advice.
  const failed = unique(checks.filter((c) => c.status === 'fail').flatMap((c) => splitMessages(c.message_ru)));
  const warned = unique(checks.filter((c) => c.status === 'warn').flatMap((c) => splitMessages(c.message_ru)));
  improve = unique([...failed, ...(improve.length > 0 ? improve : warned)]);
  return { good, improve };
}

/** One check → CheckRow props: glyph by status, «18 из 20», the message with a capital letter. */
export function checkRowProps(c: AiCheck): CheckRowProps {
  const message = splitMessages(c.message_ru).join('. ');
  return {
    status: c.status,
    title: c.title,
    ...(message ? { message } : {}),
    points: t('review.points', { points: c.points, max: c.max }),
    statusLabel: t(`check.${c.status}`),
  };
}

/** Work minutes: done − started − paused (CLAUDE.md §11 R4). null while the work has no start or end. */
export function workMinutes(o: Pick<Order, 'started_at' | 'done_at' | 'paused_total_sec'>): number | null {
  if (!o.started_at || !o.done_at) return null;
  const ms = Date.parse(o.done_at) - Date.parse(o.started_at);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, ms / 60_000 - o.paused_total_sec / 60);
}

export function normHours(o: Pick<Order, 'norm_hours' | 'fault_code'>, norms: readonly WorkNorm[]): number | null {
  if (o.norm_hours != null) return o.norm_hours;
  if (!o.fault_code) return null;
  return norms.find((n) => n.fault_code === o.fault_code)?.norm_hours ?? null;
}

/** A demo job shorter than this is compared with the accelerated norm (CLAUDE.md §20, SQL rule R4). */
const DEMO_SHORT_JOB_MIN = 15;
/** Demo acceleration: one norm hour is 2 minutes. */
const DEMO_NORM_DIVISOR = 30;

/**
 * «Время: 2 ч 10 мин при нормативе 3 ч», or only the time when the order has no norm. A demo job of a few
 * minutes shows the accelerated norm, as rule R4 judged it.
 */
export function timeLine(
  o: Pick<Order, 'started_at' | 'done_at' | 'paused_total_sec' | 'norm_hours' | 'fault_code' | 'is_demo'>,
  norms: readonly WorkNorm[],
): string | null {
  const minutes = workMinutes(o);
  if (minutes == null) return null;
  const actual = formatDuration(Math.max(1, minutes));
  const norm = normHours(o, norms);
  if (norm == null) return t('review.timeOnly', { actual });
  const shown = o.is_demo && minutes < DEMO_SHORT_JOB_MIN ? norm / DEMO_NORM_DIVISOR : norm;
  return t('review.time', { actual, norm: formatDuration(shown * 60) });
}

/** «4 из 5 · уверенность 86%». */
export function scoreSecondary(review: Pick<AiReview, 'score5' | 'confidence'>): string {
  return review.confidence != null
    ? t('review.score5Conf', { score5: review.score5, conf: formatPercent(review.confidence) })
    : t('review.score5NoConf', { score5: review.score5 });
}

export function latencyText(ms: number | null): string | null {
  return ms == null ? null : t('review.latency', { sec: formatNumber(ms / 1000, 1) });
}

/** One mascot per moment (PHASE_0 §6.11): cheer accepted, check with remarks, oops rework, read waiting. */
export function workerMascot(verdict: Verdict, waitingMaster: boolean): MascotName {
  if (verdict === 'rework') return 'oops';
  if (waitingMaster) return 'read';
  return verdict === 'accepted' ? 'cheer' : 'check';
}
