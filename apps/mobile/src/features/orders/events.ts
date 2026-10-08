// order_events → Timeline items: time, actor and a Russian line per action (CLAUDE.md §6 event names).
import {
  PRIORITIES,
  VERDICTS,
  formatDateTime,
  hhmm,
  isToday,
  reasonLabel,
  type Employee,
  type OrderEvent,
  type OrderEventAction,
  type OrderView,
  type Priority,
  type Verdict,
  PRIORITY_LABEL,
  VERDICT_LABEL,
} from '@rota/shared';

import { t } from '@/lib/i18n';
import type { TimelineItem, TimelineTone } from '@/ui/Timeline';

/** i18n key of each event action; the texts live in the shared dictionary (`event.*`). */
export const EVENT_LABEL: Readonly<Record<OrderEventAction, string>> = {
  create: 'event.create',
  accept: 'event.accept',
  queue: 'event.queue',
  reject: 'event.reject',
  start: 'event.start',
  pause: 'event.pause',
  resume: 'event.resume',
  complete: 'event.complete',
  review_started: 'event.review_started',
  ai_result: 'event.ai_result',
  close: 'event.close',
  return: 'event.return',
  resume_rework: 'event.resume_rework',
  reassign: 'event.reassign',
  cancel: 'event.cancel',
  set_priority: 'event.set_priority',
  mark_reject_justified: 'event.mark_reject_justified',
};

export function eventLabel(action: OrderEventAction): string {
  return t(EVENT_LABEL[action]);
}

const TONE: Readonly<Record<OrderEventAction, TimelineTone>> = {
  create: 'info',
  accept: 'info',
  queue: 'queue',
  reject: 'critical',
  start: 'working',
  pause: 'warning',
  resume: 'working',
  complete: 'success',
  review_started: 'info',
  ai_result: 'info',
  close: 'success',
  return: 'critical',
  resume_rework: 'working',
  reassign: 'info',
  cancel: 'neutral',
  set_priority: 'neutral',
  mark_reject_justified: 'neutral',
};

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function asVerdict(v: unknown): Verdict | null {
  return typeof v === 'string' && (VERDICTS as readonly string[]).includes(v) ? (v as Verdict) : null;
}

function asPriority(v: unknown): Priority | null {
  return typeof v === 'string' && (PRIORITIES as readonly string[]).includes(v) ? (v as Priority) : null;
}

export interface EventContext {
  order: Pick<OrderView, 'assignee_id' | 'assignee_short_name' | 'master_id' | 'master_short_name'>;
  employees: ReadonlyMap<string, Pick<Employee, 'short_name'>>;
}

export function actorName(e: Pick<OrderEvent, 'actor_id' | 'action'>, ctx: EventContext): string {
  if (!e.actor_id) {
    return e.action === 'ai_result' || e.action === 'review_started' ? t('common.ai') : t('event.actor.system');
  }
  const known = ctx.employees.get(e.actor_id)?.short_name;
  if (known) return known;
  if (e.actor_id === ctx.order.assignee_id) return ctx.order.assignee_short_name;
  if (e.actor_id === ctx.order.master_id) return ctx.order.master_short_name;
  return t('order.event.actorUnknown');
}

/** «Отклонён · Нет допуска», «Результат проверки ИИ · Принято, 87», «Переназначен · Ахметов Е.» */
export function eventText(e: OrderEvent, ctx: EventContext): string {
  const label = eventLabel(e.action);
  const p = e.payload ?? {};
  switch (e.action) {
    case 'reject':
    case 'pause':
      return e.reason ? t('order.event.withReason', { label, reason: reasonLabel(e.reason) }) : label;
    case 'cancel':
      return e.reason ? t('order.event.withReason', { label, reason: e.reason }) : label;
    case 'ai_result': {
      const verdict = asVerdict(p.verdict);
      const score = num(p.score);
      return verdict && score !== null
        ? t('order.event.verdict', { label, verdict: VERDICT_LABEL[verdict], score })
        : label;
    }
    case 'close': {
      const verdict = asVerdict(p.final_verdict);
      const score = num(p.final_score);
      return verdict && score !== null
        ? t('order.event.verdict', { label, verdict: VERDICT_LABEL[verdict], score })
        : label;
    }
    case 'reassign': {
      const to = str(p.to_assignee_id);
      const name = to ? (ctx.employees.get(to)?.short_name ?? (to === ctx.order.assignee_id ? ctx.order.assignee_short_name : null)) : null;
      return name ? t('order.event.reassignTo', { label, name }) : label;
    }
    case 'set_priority': {
      const pr = asPriority(p.to_priority);
      return pr ? t('order.event.priority', { label, priority: PRIORITY_LABEL[pr] }) : label;
    }
    default:
      return label;
  }
}

function tone(e: OrderEvent): TimelineTone {
  if (e.action === 'ai_result') {
    const verdict = asVerdict(e.payload?.verdict);
    if (e.to_status === 'rework' || verdict === 'rework') return 'critical';
    if (verdict === 'accepted_with_remarks') return 'warning';
    if (verdict === 'accepted') return 'success';
  }
  if (e.action === 'set_priority' && asPriority(e.payload?.to_priority) === 'emergency') return 'critical';
  return TONE[e.action];
}

/** Timeline rows oldest first. Times are «14:05» when every event is today, else «08.10 14:05». */
export function timelineItems(
  events: readonly OrderEvent[],
  ctx: EventContext,
  now: Date,
): { items: TimelineItem[]; wide: boolean } {
  const sorted = [...events].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id - b.id);
  const wide = sorted.some((e) => !isToday(e.created_at, now));
  const items = sorted.map((e) => {
    const text = eventText(e, ctx);
    const comment = e.comment && e.action !== 'cancel' ? t('order.event.comment', { comment: e.comment }) : null;
    return {
      id: String(e.id),
      time: wide ? formatDateTime(e.created_at) : hhmm(e.created_at),
      title: actorName(e, ctx),
      subtitle: comment ? `${text}\n${comment}` : text,
      tone: tone(e),
    } satisfies TimelineItem;
  });
  return { items, wide };
}
