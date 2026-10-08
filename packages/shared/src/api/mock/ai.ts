// The mock AI (PHASE_0 §8): the completion check behind complete and ai.verify, plus the texts of the shift
// summary and the rating explanation. The check is public.ai_submit with a deterministic stand in for the LLM:
// rulesChecks (R1 to R4, the SQL rules) + mockJudgement (full when the works text is over 20 characters, photo
// score 4 with an after photo) → aggregateReview → one ai_reviews row per attempt → ai_result through the state
// machine (rework, or the report and review_ready notifications).

import { RotaError } from '../errors';
import { applyAction } from '../../domain/transitions';
import {
  aggregateReview,
  materialP90Lookup,
  mockJudgement,
  rulesChecks,
  toAiReview,
} from '../../domain/verifyRules';
import { computeRating, RATING_COMPONENTS, type RatingComponent } from '../../domain/rating';
import { REJECT_REASON_LABEL } from '../../domain/reasons';
import type { RejectReason } from '../../domain/enums';
import type {
  AiReview,
  Period,
  RatingRow,
  Session,
  ShiftReport,
  ShiftSummary,
} from '../../domain/types';
import { formatDuration } from '../../format/time';
import { formatNumber, ORDER_FORMS, plural } from '../../format/number';
import type { Change } from './events';
import type { MockDb } from './store';

/** ai_reviews.model of mock reviews. */
export const MOCK_MODEL = 'mock';

export interface ReviewRun {
  review: AiReview;
  /** false when the review of this attempt already existed (nothing changed). */
  created: boolean;
  changes: Change[];
}

/**
 * public.ai_submit with the mock judgement for the order's current attempt (rework_count + 1). Returns the
 * existing review when there is one; BAD_TRANSITION when the order is not waiting for a check.
 */
export function runMockReview(
  db: MockDb,
  orderId: number,
  now: Date,
  latencyMs: number | null = null,
): ReviewRun {
  const order = db.order(orderId);
  if (!order) throw new RotaError('BAD_INPUT', { details: 'order not found' });
  const attempt = order.rework_count + 1;
  const existing = db.reviewFor(order.id, attempt);
  if (existing) return { review: existing, created: false, changes: [] };
  if (order.status !== 'ai_review') {
    throw new RotaError('BAD_TRANSITION', { details: 'the order is not waiting for a check' });
  }

  const { state } = db;
  const lastComplete = db
    .orderEvents(order.id)
    .filter((e) => e.action === 'complete')
    .pop();
  const lines = state.materials.filter((m) => m.order_id === order.id);
  const rules = rulesChecks({
    order,
    photos: state.photos,
    orderNumber: (id) => db.order(id)?.number,
    materials: lines,
    no_materials: lastComplete?.payload.no_materials === true,
    directories: db.dirs,
    p90: materialP90Lookup(order.fault_code, state.orders, state.materials),
    duplicate_hamming_max: state.settings.duplicate_hamming_max,
    now,
  });
  const afterPhotos = db.orderPhotos(order).filter((p) => p.kind === 'after').length;
  const outcome = aggregateReview(rules, mockJudgement({ order, after_photos: afterPhotos }), {
    threshold: state.settings.ai_confidence_threshold,
    meta: { model: MOCK_MODEL, latency_ms: latencyMs },
  });
  const review = toAiReview(outcome, {
    id: db.next('review'),
    order_id: order.id,
    attempt,
    created_at: now.toISOString(),
  });
  state.reviews.push(review);

  const result = applyAction(
    order,
    'ai_result',
    { review_id: review.id },
    {
      actor: 'system',
      now,
      orders: state.orders,
      events: state.events,
      employees: state.employees,
      brigades: db.dirs.brigades,
      reviews: state.reviews,
    },
  );
  const out = db.commit(result, now);
  return {
    review,
    created: true,
    changes: [{ topic: 'reviews', type: 'INSERT', row: review }, ...out.changes],
  };
}

// ---------------------------------------------------------------------------
// shift summary (ai-shift-summary stand in)
// ---------------------------------------------------------------------------

const lowerFirst = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

/** 5 to 8 sentences and 3 recommendations from the shift report numbers, in the case's plain tone. */
export function mockShiftSummary(report: ShiftReport): ShiftSummary {
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
      ? (REJECT_REASON_LABEL[reason.reason as RejectReason] ?? reason.reason)
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
// rating explanation (ai-explain-rating stand in)
// ---------------------------------------------------------------------------

const COMPONENT_LABEL: Readonly<Record<RatingComponent, string>> = {
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

/** Three sentences: what helped, what hurt, one concrete action. */
export function mockExplainRating(row: RatingRow | undefined): string {
  if (!row || row.score == null) {
    return 'Закрытых нарядов за период нет, поэтому рейтинг не рассчитан. Закройте несколько нарядов, и ИИ разберёт результат. Начните с нарядов в очереди.';
  }
  const parts = RATING_COMPONENTS.map((k) => ({ k, v: row[k] ?? 0 }));
  const best = parts.reduce((a, b) => (b.v > a.v ? b : a));
  const worst = parts.reduce((a, b) => (b.v < a.v ? b : a));
  const pct = (x: number): string => `${Math.round(x * 100)}%`;
  return (
    `Сильнее всего рейтинг поднимает ${COMPONENT_LABEL[best.k]}: ${pct(best.v)}. ` +
    `Ниже всего ${COMPONENT_LABEL[worst.k]}: ${pct(worst.v)}. ` +
    COMPONENT_ACTION[worst.k]
  );
}

/** The rating row of one worker for the explanation, as public.rating computes it. */
export function ratingRowFor(
  db: MockDb,
  employeeId: string,
  period: Period,
  viewer: Session,
): RatingRow | undefined {
  return computeRating({
    period,
    employees: db.state.employees,
    brigades: db.dirs.brigades,
    orders: db.state.orders,
    events: db.state.events,
    viewer: { id: viewer.user_id, role: viewer.role },
  }).find((r) => r.kind === 'worker' && r.id === employeeId);
}
