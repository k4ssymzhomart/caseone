// Which buttons an order shows, for whom (CLAUDE.md §6 transition table). The server decides for real
// (order_action raises FORBIDDEN or BAD_TRANSITION); this mirrors it so the UI only offers legal moves.
import {
  ACTIVE_STATUSES,
  STATUSES,
  type OrderAction,
  type OrderEvent,
  type OrderView,
  type Session,
  type Status,
} from '@rota/shared';

import { t } from '@/lib/i18n';

/** order_action: the statuses each action may start from (20261008100004_rota_state_machine.sql). */
export const ACTION_FROM: Readonly<Record<OrderAction, readonly Status[]>> = {
  accept: ['issued', 'queued'],
  queue: ['issued'],
  reject: ['issued', 'queued', 'accepted'],
  start: ['accepted', 'queued'],
  pause: ['in_progress'],
  resume: ['paused'],
  complete: ['in_progress'],
  resume_rework: ['rework'],
  close: ['ai_review', 'rework'],
  return: ['ai_review'],
  reassign: ['issued', 'queued', 'accepted', 'rejected', 'paused', 'in_progress', 'rework'],
  cancel: STATUSES.filter((s) => s !== 'closed' && s !== 'cancelled'),
  set_priority: ACTIVE_STATUSES,
  mark_reject_justified: STATUSES,
};

const ASSIGNEE_ACTIONS: ReadonlySet<OrderAction> = new Set([
  'accept',
  'queue',
  'reject',
  'start',
  'pause',
  'resume',
  'complete',
  'resume_rework',
]);

export function isStaff(session: Pick<Session, 'role'>): boolean {
  return session.role === 'master' || session.role === 'admin';
}

/** Mirrors the "who may do what" block of order_action: assignee actions for the assignee only, the rest for masters and admins. */
export function canPerform(
  action: OrderAction,
  order: Pick<OrderView, 'status' | 'assignee_id'>,
  session: Pick<Session, 'role' | 'user_id'>,
): boolean {
  if (!ACTION_FROM[action].includes(order.status)) return false;
  if (ASSIGNEE_ACTIONS.has(action)) return session.user_id === order.assignee_id;
  return isStaff(session);
}

/** The latest reject event that no mark_reject_justified event points at yet. */
export function unjustifiedReject(events: readonly OrderEvent[]): OrderEvent | null {
  const justified = new Set<number>();
  for (const e of events) {
    if (e.action !== 'mark_reject_justified') continue;
    const id = Number(e.payload.reject_event_id);
    if (Number.isFinite(id)) justified.add(id);
  }
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e && e.action === 'reject' && !justified.has(e.id)) return e;
  }
  return null;
}

/**
 * What a button of the action bar does:
 * accept, queue, start, resume, resume_rework → order_action right away;
 * reject, pause → the reason sheet; complete → the close form; review → the AI report;
 * reassign → ReassignSheet; priority → the priority sheet; cancel → the cancel sheet;
 * justify → mark_reject_justified for the latest unjustified reject.
 */
export type UiActionId =
  | 'accept'
  | 'queue'
  | 'reject'
  | 'start'
  | 'complete'
  | 'pause'
  | 'resume'
  | 'resume_rework'
  | 'review'
  | 'reassign'
  | 'priority'
  | 'cancel'
  | 'justify';

export interface UiAction {
  id: UiActionId;
  label: string;
  /** primary: the one main move (64 px inverse pill, full width); secondary: everything else. */
  variant: 'primary' | 'secondary';
  /** The order_action it ends in, null for pure navigation (review). */
  action: OrderAction | null;
}

const LABEL: Readonly<Record<UiActionId, string>> = {
  accept: 'order.action.accept',
  queue: 'order.action.queue',
  reject: 'order.action.reject',
  start: 'order.action.start',
  complete: 'order.action.complete',
  pause: 'order.action.pause',
  resume: 'order.action.resume',
  resume_rework: 'order.action.resumeRework',
  review: 'order.action.review',
  reassign: 'order.action.reassign',
  priority: 'order.action.priority',
  cancel: 'order.action.cancel',
  justify: 'order.action.justify',
};

const ACTION_OF: Readonly<Record<UiActionId, OrderAction | null>> = {
  accept: 'accept',
  queue: 'queue',
  reject: 'reject',
  start: 'start',
  complete: 'complete',
  pause: 'pause',
  resume: 'resume',
  resume_rework: 'resume_rework',
  review: null,
  reassign: 'reassign',
  priority: 'set_priority',
  cancel: 'cancel',
  justify: 'mark_reject_justified',
};

function ui(id: UiActionId, variant: UiAction['variant'] = 'secondary'): UiAction {
  return { id, label: t(LABEL[id]), variant, action: ACTION_OF[id] };
}

/**
 * Worker buttons on the worker's own order, in the order they show (PHASE_0 §7.1): issued → «Принять в
 * работу», «В очередь», «Отклонить»; accepted → «Начать исполнение»; in_progress → «Исполнено»,
 * «Приостановить»; paused → «Продолжить»; rework → «Начать доработку». queued is not in that table: it
 * offers what order_action allows from it (start, accept, reject). The server still accepts a reject from
 * accepted; the phone keeps the §7.1 bar and the master can reassign.
 */
function workerActions(order: OrderView, hasReview: boolean): UiAction[] {
  switch (order.status) {
    case 'issued':
      return [ui('accept', 'primary'), ui('queue'), ui('reject')];
    case 'queued':
      return [ui('start', 'primary'), ui('accept'), ui('reject')];
    case 'accepted':
      return [ui('start', 'primary')];
    case 'in_progress':
      return [ui('complete', 'primary'), ui('pause')];
    case 'paused':
      return [ui('resume', 'primary')];
    case 'rework':
      return hasReview ? [ui('resume_rework', 'primary'), ui('review')] : [ui('resume_rework', 'primary')];
    case 'ai_review':
    case 'done':
      return [ui('review', 'primary')];
    case 'closed':
      return hasReview ? [ui('review', 'primary')] : [];
    case 'rejected':
    case 'cancelled':
      return [];
  }
}

/** Master buttons: report first where the master closes, reassign first on a rejected order. */
function masterActions(order: OrderView, session: Session, events: readonly OrderEvent[], hasReview: boolean): UiAction[] {
  const out: UiAction[] = [];
  const reviewable = order.status === 'ai_review' || order.status === 'rework' || order.status === 'closed';
  if (reviewable && (hasReview || order.status !== 'closed')) out.push(ui('review', 'primary'));
  if (canPerform('reassign', order, session)) {
    out.push(ui('reassign', order.status === 'rejected' && out.length === 0 ? 'primary' : 'secondary'));
  }
  if (canPerform('set_priority', order, session)) out.push(ui('priority'));
  if (unjustifiedReject(events)) out.push(ui('justify'));
  if (canPerform('cancel', order, session)) out.push(ui('cancel'));
  return out;
}

/**
 * The action bar of order/[id] for this viewer. Workers act on their own orders; masters and admins
 * manage any order; managers and other workers only read.
 */
export function availableActions(
  order: OrderView,
  session: Session,
  events: readonly OrderEvent[] = [],
  hasReview = false,
): UiAction[] {
  if (isStaff(session)) return masterActions(order, session, events, hasReview);
  if (session.role === 'worker' && session.user_id === order.assignee_id) return workerActions(order, hasReview);
  return [];
}
