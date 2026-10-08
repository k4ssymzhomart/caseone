// The order state machine (CLAUDE.md §6) as data plus two pure functions.
// TRANSITIONS is the table; allowedActions() picks the buttons for the UI; applyAction() and applyCreate() mirror
// internal.apply_action and public.create_order of supabase/migrations/20261008100004_rota_state_machine.sql
// step by step (same checks in the same order, same error codes and details, same side effects), so MockApi
// behaves like the database. supabase/tests/transitions.json is the SQL side of the table; parity.test.ts
// keeps the two in agreement.

import { RotaError } from '../api/errors';
import {
  ACTIVE_STATUSES,
  MASTER_ACTIONS,
  ORDER_ACTIONS,
  ORDER_TYPES,
  PAUSE_REASON_VALUES,
  PRIORITIES,
  REJECT_REASON_VALUES,
  STATUSES,
  VERDICTS,
  WORKER_ACTIONS,
  type MasterAction,
  type NotificationKind,
  type OrderAction,
  type OrderType,
  type Priority,
  type RejectReason,
  type Role,
  type Status,
  type Verdict,
  type WorkerAction,
} from './enums';
import { PRIORITY_DEFAULT_HOURS } from './priority';
import { REJECT_REASON_LABEL } from './reasons';
import { VERDICT_LABEL } from './status';
import type {
  ActionPayload,
  AiReview,
  Brigade,
  CreateOrderInput,
  Employee,
  Equipment,
  MaterialLine,
  Order,
  OrderEvent,
  Settings,
  Uuid,
  WorkNorm,
} from './types';

// ---------------------------------------------------------------------------
// the table
// ---------------------------------------------------------------------------

/** Who may perform an action: the order's assignee, a master role, or the system (secret key). */
export type TransitionActor = 'assignee' | 'master' | 'system';

/** Every row of the §6 table: create, the client actions and the system action ai_result. */
export type TransitionAction = 'create' | OrderAction | 'ai_result';

/** Payload fields whose absence raises MISSING_REASON. */
export type RequiredField = 'reason' | 'comment';

export interface Transition {
  actor: TransitionActor;
  /** Statuses the action starts from; [] for create (no order yet). */
  from: readonly Status[];
  /** Target status; 'same' keeps the status; a list when the outcome decides (ai_result). */
  to: Status | 'same' | readonly Status[];
  /** Intermediate status written by the same call (complete: in_progress → done → ai_review). */
  via?: Status;
  /** MISSING_REASON when one of these is empty. */
  requires?: readonly RequiredField[];
  /** reject: the comment becomes required for this reason. */
  comment_required_when_reason?: RejectReason;
  /** One order in progress per worker: ANOTHER_IN_PROGRESS unless pause_current. */
  single_in_progress?: boolean;
  /** mark_reject_justified: allowed on any order that has a reject event, whatever its status. */
  needs_reject_event?: boolean;
  /** Payload keys the action reads (documentation and form building). */
  payload: readonly string[];
}

/** Roles that perform the master actions (transitions.json master_roles). */
export const MASTER_ROLES = ['master', 'admin'] as const satisfies readonly Role[];
/** public.is_staff(): roles that see every order. */
export const STAFF_ROLES = ['master', 'manager', 'admin'] as const satisfies readonly Role[];

/** equipment.is_stopped stays true while an order with equipment_stopped is in one of these (internal.refresh_equipment). */
export const EQUIPMENT_STOPPED_STATUSES = [
  'issued',
  'accepted',
  'queued',
  'rejected',
  'in_progress',
  'paused',
  'rework',
] as const satisfies readonly Status[];

const REASSIGN_FROM = [
  'issued',
  'queued',
  'accepted',
  'rejected',
  'paused',
  'in_progress',
  'rework',
] as const satisfies readonly Status[];

const CANCEL_FROM: readonly Status[] = STATUSES.filter((s) => s !== 'closed' && s !== 'cancelled');

export const TRANSITIONS: Readonly<Record<TransitionAction, Transition>> = {
  create: {
    actor: 'master',
    from: [],
    to: 'issued',
    payload: [
      'type',
      'priority',
      'description',
      'equipment_id',
      'assignee_id',
      'brigade_id',
      'due_at',
      'due_in_min',
      'norm_hours',
      'client_ref',
      'comment',
      'equipment_stopped',
      'suggested_fault_code',
      'allow_off_shift',
    ],
  },
  accept: { actor: 'assignee', from: ['issued', 'queued'], to: 'accepted', payload: ['comment'] },
  queue: { actor: 'assignee', from: ['issued'], to: 'queued', payload: ['comment'] },
  reject: {
    actor: 'assignee',
    from: ['issued', 'queued', 'accepted'],
    to: 'rejected',
    requires: ['reason'],
    comment_required_when_reason: 'other',
    payload: ['reason', 'comment'],
  },
  start: {
    actor: 'assignee',
    from: ['accepted', 'queued'],
    to: 'in_progress',
    single_in_progress: true,
    payload: ['pause_current', 'comment'],
  },
  pause: {
    actor: 'assignee',
    from: ['in_progress'],
    to: 'paused',
    requires: ['reason'],
    payload: ['reason', 'comment'],
  },
  resume: {
    actor: 'assignee',
    from: ['paused'],
    to: 'in_progress',
    single_in_progress: true,
    payload: ['pause_current', 'comment'],
  },
  complete: {
    actor: 'assignee',
    from: ['in_progress'],
    to: 'ai_review',
    via: 'done',
    payload: ['works_done', 'fault_code', 'materials', 'no_materials', 'comment'],
  },
  ai_result: { actor: 'system', from: ['ai_review'], to: ['rework', 'ai_review'], payload: ['review_id'] },
  close: {
    actor: 'master',
    from: ['ai_review', 'rework'],
    to: 'closed',
    payload: ['final_verdict', 'final_score', 'comment'],
  },
  return: {
    actor: 'master',
    from: ['ai_review'],
    to: 'rework',
    requires: ['comment'],
    payload: ['comment'],
  },
  resume_rework: {
    actor: 'assignee',
    from: ['rework'],
    to: 'in_progress',
    single_in_progress: true,
    payload: ['pause_current', 'comment'],
  },
  reassign: {
    actor: 'master',
    from: REASSIGN_FROM,
    to: 'issued',
    payload: ['assignee_id', 'brigade_id', 'allow_off_shift', 'comment'],
  },
  cancel: {
    actor: 'master',
    from: CANCEL_FROM,
    to: 'cancelled',
    requires: ['reason'],
    payload: ['reason', 'comment'],
  },
  set_priority: {
    actor: 'master',
    from: ACTIVE_STATUSES,
    to: 'same',
    payload: ['priority', 'comment'],
  },
  mark_reject_justified: {
    actor: 'master',
    from: STATUSES,
    to: 'same',
    needs_reject_event: true,
    payload: ['reject_event_id', 'comment'],
  },
};

export function isWorkerAction(action: string): action is WorkerAction {
  return (WORKER_ACTIONS as readonly string[]).includes(action);
}

export function isMasterAction(action: string): action is MasterAction {
  return (MASTER_ACTIONS as readonly string[]).includes(action);
}

export function isMasterRole(role: Role | null | undefined): boolean {
  return role != null && (MASTER_ROLES as readonly Role[]).includes(role);
}

export function isStaffRole(role: Role | null | undefined): boolean {
  return role != null && (STAFF_ROLES as readonly Role[]).includes(role);
}

// ---------------------------------------------------------------------------
// allowedActions: the buttons
// ---------------------------------------------------------------------------

/** The signed-in user as the state machine sees them; a Session fits. */
export interface Actor {
  user_id: Uuid;
  role: Role;
}

export interface AllowedActionsOptions {
  /** The order's events. mark_reject_justified is offered only for a reject event not yet marked justified. */
  events?: readonly Pick<OrderEvent, 'id' | 'action' | 'payload'>[];
}

/** Reject events of the order that no mark_reject_justified event points at yet. */
export function unjustifiedRejectEvents<E extends Pick<OrderEvent, 'id' | 'action' | 'payload'>>(
  events: readonly E[],
): E[] {
  const justified = new Set(
    events
      .filter((e) => e.action === 'mark_reject_justified')
      .map((e) => Number(e.payload.reject_event_id)),
  );
  return events.filter((e) => e.action === 'reject' && !justified.has(e.id));
}

/**
 * Actions the user may call on this order now, in ORDER_ACTIONS order. A worker gets assignee actions on
 * their own orders only; master and admin get the master actions; managers get none (they only watch).
 * start, resume and resume_rework are listed even when another order is in progress: the server answers
 * ANOTHER_IN_PROGRESS and the UI asks to pause it.
 */
export function allowedActions(
  order: Pick<Order, 'status' | 'assignee_id'>,
  session: Actor | null | undefined,
  options: AllowedActionsOptions = {},
): OrderAction[] {
  if (!session) return [];
  const isAssignee = session.user_id === order.assignee_id;
  const isMaster = isMasterRole(session.role);
  const hasOpenReject = options.events ? unjustifiedRejectEvents(options.events).length > 0 : false;
  return ORDER_ACTIONS.filter((action) => {
    const tr = TRANSITIONS[action];
    if (tr.actor === 'assignee' && !isAssignee) return false;
    if (tr.actor === 'master' && !isMaster) return false;
    if (tr.needs_reject_event) return hasOpenReject;
    return tr.from.includes(order.status);
  });
}

/** One action check, same rule as allowedActions. */
export function canPerform(
  order: Pick<Order, 'status' | 'assignee_id'>,
  action: OrderAction,
  session: Actor | null | undefined,
  options: AllowedActionsOptions = {},
): boolean {
  return allowedActions(order, session, options).includes(action);
}

// ---------------------------------------------------------------------------
// applyAction / applyCreate: results and side effects
// ---------------------------------------------------------------------------

/** An order_events row before the store gives it an id. */
export type NewOrderEvent = Omit<OrderEvent, 'id'>;

/** The p_vars of internal.notify (same keys as NotificationVars in templates.ts). */
export interface TransitionNotifyVars {
  reason_label?: string;
  top_reason?: string;
  verdict_label?: string;
  score?: number | null;
  unsure?: boolean;
  reason?: string;
}

/** The master fields of ai_reviews written by close and return. */
export type ReviewMasterPatch = Partial<
  Pick<AiReview, 'master_verdict' | 'master_score' | 'master_comment' | 'master_id' | 'master_decided_at'>
>;

export type SideEffect =
  /** Another order changed in the same call (the order paused by pause_current). */
  | { type: 'update_order'; order: Order }
  /** complete: the order's material lines become exactly these (qty > 0 only). */
  | { type: 'replace_materials'; order_id: number; lines: MaterialLine[] }
  /** close and return write the master's decision into the current review. */
  | { type: 'update_review'; review_id: number; patch: ReviewMasterPatch }
  /** accept and start switch the worker's shift on. */
  | { type: 'set_on_shift'; employee_id: Uuid; on_shift: boolean }
  /** internal.refresh_equipment after every call. */
  | { type: 'equipment_stopped'; equipment_id: number; is_stopped: boolean }
  /** create: before photos uploaded under the draft's client_ref join the new order. */
  | { type: 'attach_photos'; client_ref: Uuid; order_id: number }
  /**
   * A notification to insert with templates.ts. dedupe_key = notificationDedupeKey(id of
   * events[main_event], key): «ev:{event id}:{kind}», or «ev:{event id}:new» for create.
   */
  | {
      type: 'notify';
      recipient_id: Uuid;
      order_id: number;
      kind: NotificationKind;
      key: string;
      vars: TransitionNotifyVars;
    }
  /** complete: the client invokes ai-verify now (MockApi: run the mock check). */
  | { type: 'ai_verify'; order_id: number };

export interface ActionResult {
  /** The order after the call (unchanged on a replay). */
  order: Order;
  /** Events to insert in this order: the auto pause of another order comes first, review_started last. */
  events: NewOrderEvent[];
  /** Index in `events` of the action's own event, the one notification keys refer to. -1 on a replay. */
  main_event: number;
  sideEffects: SideEffect[];
  /** The client_action_id was already applied: nothing changed. */
  replayed: boolean;
}

export function notificationDedupeKey(eventId: number, key: string): string {
  return `ev:${eventId}:${key}`;
}

/** ai_result needs the review id; only order_system_action (the secret key) may send it. */
export interface SystemActionPayload extends ActionPayload {
  review_id?: number;
}

export interface ActionContext {
  /** The caller; 'system' for order_system_action (actor_id null in the events). */
  actor: Actor | 'system';
  /** The server clock. */
  now: Date;
  clientActionId?: Uuid | null;
  /** Every order in the store: the other in progress order, queue positions, equipment stop. */
  orders?: readonly Order[];
  /** Events of this order or of every order: replays, duplicate client_action_id, mark_reject_justified. */
  events?: readonly Pick<OrderEvent, 'id' | 'order_id' | 'action' | 'client_action_id'>[];
  /** reassign target, on_shift switch. */
  employees?: readonly Pick<Employee, 'id' | 'role' | 'on_shift' | 'short_name'>[];
  /** reassign to a brigade: its leader. */
  brigades?: readonly Pick<Brigade, 'id' | 'leader_id'>[];
  /** ai_result reads payload.review_id; close and return read order.ai_review_id. */
  reviews?: readonly AiReview[];
}

// ---------------------------------------------------------------------------
// small SQL mirrors
// ---------------------------------------------------------------------------

/** nullif(btrim(coalesce(x, '')), ''): Postgres btrim removes spaces only. */
function btrimOrNull(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).replace(/^ +| +$/g, '');
  return s === '' ? null : s;
}

/** nullif(x, ''). */
function emptyToNull(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value);
  return s === '' ? null : s;
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function ms(value: string): number {
  return Date.parse(value);
}

function fail(code: 'FORBIDDEN' | 'BAD_TRANSITION' | 'MISSING_REASON' | 'BAD_INPUT', detail?: string): never {
  throw new RotaError(code, { details: detail ?? code });
}

/** «Аварийный наряд №{n}» when the order being started is an emergency, else «Переключился на наряд №{n}». */
export function pauseCommentFor(order: Pick<Order, 'priority' | 'number'>): string {
  return order.priority === 'emergency'
    ? `Аварийный наряд №${order.number}`
    : `Переключился на наряд №${order.number}`;
}

/** Rework deadline: greatest(due_at, now + greatest(30 min, 0.5 × norm)); a missing norm counts as 1 h. */
export function reworkDueAt(order: Pick<Order, 'due_at' | 'norm_hours'>, now: Date): string {
  const extendMs = Math.max(30 * 60_000, (order.norm_hours ?? 1) * 1800 * 1000);
  return iso(Math.max(ms(order.due_at), now.getTime() + extendMs));
}

/** internal.refresh_equipment: stopped while an order with equipment_stopped on the unit is still open. */
export function equipmentIsStopped(
  equipmentId: number,
  orders: readonly Pick<Order, 'equipment_id' | 'equipment_stopped' | 'status'>[],
): boolean {
  return orders.some(
    (o) =>
      o.equipment_id === equipmentId &&
      o.equipment_stopped &&
      (EQUIPMENT_STOPPED_STATUSES as readonly Status[]).includes(o.status),
  );
}

/** The rejected notification's reason: the label, plus «: comment» (first letter lowercased) for other. */
function rejectReasonLabel(reason: RejectReason, comment: string | null): string {
  const label = REJECT_REASON_LABEL[reason];
  if (reason !== 'other' || comment == null) return label;
  return `${label}: ${comment.charAt(0).toLowerCase()}${comment.slice(1)}`;
}

function mergeOrders(orders: readonly Order[], changed: readonly Order[]): Order[] {
  const byId = new Map(changed.map((o) => [o.id, o]));
  const merged = orders.map((o) => byId.get(o.id) ?? o);
  for (const c of changed) if (!orders.some((o) => o.id === c.id)) merged.push(c);
  return merged;
}

function isVisibleReplay(order: Order, actor: Actor | 'system'): boolean {
  if (actor === 'system') return true;
  return isStaffRole(actor.role) || order.assignee_id === actor.user_id;
}

// ---------------------------------------------------------------------------
// applyAction (internal.apply_action)
// ---------------------------------------------------------------------------

/**
 * Applies one order_action (or the system action ai_result) to `order` without touching anything else:
 * returns the new order, the events to insert and the side effects for the store. Throws RotaError with
 * the SQL codes and details: FORBIDDEN, BAD_TRANSITION, MISSING_REASON, ANOTHER_IN_PROGRESS, NOT_ON_SHIFT,
 * BAD_INPUT. A client_action_id already present in the order's events returns the order unchanged.
 */
export function applyAction(
  order: Order,
  action: OrderAction | 'ai_result',
  payload: SystemActionPayload,
  ctx: ActionContext,
): ActionResult {
  const { actor, now } = ctx;
  const nowIso = now.toISOString();
  const clientActionId = ctx.clientActionId ?? null;
  const orderEvents = (ctx.events ?? []).filter((e) => e.order_id === order.id);

  // a repeated client_action_id returns the current order without applying the action twice; the same id
  // on another order (or one the caller cannot see) is the unique violation the database would raise
  const seen =
    clientActionId == null ? undefined : ctx.events?.find((e) => e.client_action_id === clientActionId);
  if (seen) {
    if (seen.order_id === order.id && isVisibleReplay(order, actor)) {
      return { order, events: [], main_event: -1, sideEffects: [], replayed: true };
    }
    fail('BAD_INPUT', 'duplicate client_action_id');
  }

  const uid = actor === 'system' ? null : actor.user_id;
  const role = actor === 'system' ? null : actor.role;
  const system = actor === 'system';

  // who may do what
  if (action === 'ai_result') {
    if (!system) fail('FORBIDDEN', 'system action');
  } else if (isWorkerAction(action)) {
    if (uid == null || uid !== order.assignee_id) fail('FORBIDDEN', 'only the assignee');
  } else if (isMasterAction(action)) {
    if (!isMasterRole(role)) fail('FORBIDDEN', 'only a master');
  } else {
    fail('BAD_TRANSITION', `unknown action ${String(action)}`);
  }

  const from = order.status;
  const comment = btrimOrNull(payload.comment);
  const orders = ctx.orders ?? [];
  let o: Order = { ...order };
  let to: Status = from;
  let reason: string | null = null;
  let evPayload: Record<string, unknown> = {};
  const before: NewOrderEvent[] = [];
  const changed: Order[] = [];
  const effects: SideEffect[] = [];
  const notes: { to: Uuid | null; kind: NotificationKind; vars: TransitionNotifyVars }[] = [];

  const requireFrom = (allowed: readonly Status[]): void => {
    if (!allowed.includes(from)) fail('BAD_TRANSITION');
  };

  const switchOnShift = (): void => {
    if (uid == null) return;
    const emp = ctx.employees?.find((e) => e.id === uid);
    if (emp?.on_shift !== true) effects.push({ type: 'set_on_shift', employee_id: uid, on_shift: true });
  };

  // internal.ensure_single_in_progress
  const ensureSingleInProgress = (): void => {
    const others = orders
      .filter((x) => x.assignee_id === order.assignee_id && x.status === 'in_progress' && x.id !== order.id)
      .sort((a, b) => {
        // order by started_at desc nulls last
        if (a.started_at == null) return b.started_at == null ? 0 : 1;
        if (b.started_at == null) return -1;
        return ms(b.started_at) - ms(a.started_at);
      });
    const other = others[0];
    if (!other) return;
    if (payload.pause_current !== true) {
      throw new RotaError('ANOTHER_IN_PROGRESS', {
        details: { order_id: other.id, number: other.number },
      });
    }
    const autoComment = pauseCommentFor(order);
    changed.push({ ...other, status: 'paused', paused_since: nowIso, last_comment: autoComment });
    before.push({
      order_id: other.id,
      actor_id: uid,
      action: 'pause',
      from_status: 'in_progress',
      to_status: 'paused',
      reason: 'other',
      comment: autoComment,
      payload: { auto: true, for_order_id: order.id },
      client_action_id: null,
      created_at: nowIso,
    });
  };

  const findReview = (id: number | null | undefined): AiReview | undefined =>
    id == null ? undefined : ctx.reviews?.find((r) => r.id === id && r.order_id === order.id);

  switch (action) {
    case 'accept': {
      requireFrom(['issued', 'queued']);
      to = 'accepted';
      o = { ...o, status: to, accepted_at: o.accepted_at ?? nowIso, queue_position: null };
      switchOnShift();
      break;
    }

    case 'queue': {
      requireFrom(['issued']);
      to = 'queued';
      const maxPos = orders
        .filter((x) => x.assignee_id === order.assignee_id && x.status === 'queued' && x.id !== order.id)
        .reduce((m, x) => Math.max(m, x.queue_position ?? 0), 0);
      o = { ...o, status: to, queued_at: nowIso, queue_position: maxPos + 1 };
      break;
    }

    case 'reject': {
      requireFrom(['issued', 'queued', 'accepted']);
      const r = payload.reason;
      if (r == null || !(REJECT_REASON_VALUES as readonly string[]).includes(r)) {
        fail('MISSING_REASON', 'reject reason');
      }
      const rr = r as RejectReason;
      if (rr === 'other' && comment == null) fail('MISSING_REASON', 'comment required for other');
      reason = rr;
      to = 'rejected';
      o = { ...o, status: to, rejected_at: nowIso, queue_position: null };
      notes.push({ to: order.master_id, kind: 'rejected', vars: { reason_label: rejectReasonLabel(rr, comment) } });
      break;
    }

    case 'start': {
      requireFrom(['accepted', 'queued']);
      ensureSingleInProgress();
      to = 'in_progress';
      o = {
        ...o,
        status: to,
        started_at: o.started_at ?? nowIso,
        accepted_at: o.accepted_at ?? nowIso,
        queue_position: null,
      };
      switchOnShift();
      break;
    }

    case 'pause': {
      requireFrom(['in_progress']);
      const r = payload.reason;
      if (r == null || !(PAUSE_REASON_VALUES as readonly string[]).includes(r)) {
        fail('MISSING_REASON', 'pause reason');
      }
      reason = r;
      to = 'paused';
      o = { ...o, status: to, paused_since: nowIso };
      break;
    }

    case 'resume': {
      requireFrom(['paused']);
      ensureSingleInProgress();
      to = 'in_progress';
      const add = o.paused_since == null ? 0 : Math.floor((now.getTime() - ms(o.paused_since)) / 1000);
      o = { ...o, status: to, paused_total_sec: o.paused_total_sec + add, paused_since: null };
      break;
    }

    case 'complete': {
      requireFrom(['in_progress']);
      const lines: MaterialLine[] = (payload.materials ?? [])
        .filter((m) => Number(m.qty ?? 0) > 0)
        .map((m) => ({ material_id: Math.trunc(Number(m.material_id)), qty: Number(m.qty) }));
      effects.push({ type: 'replace_materials', order_id: order.id, lines });
      // ai_review_id is cleared so no stale verdict shows while the new attempt is checked
      o = {
        ...o,
        status: 'done',
        done_at: nowIso,
        works_done: btrimOrNull(payload.works_done),
        fault_code: emptyToNull(payload.fault_code),
        closing_comment: comment,
        ai_review_id: null,
      };
      evPayload = {
        works_done: payload.works_done ?? null,
        fault_code: payload.fault_code ?? null,
        materials: payload.materials ?? [],
        no_materials: payload.no_materials ?? false,
      };
      to = 'done';
      break;
    }

    case 'ai_result': {
      requireFrom(['ai_review']);
      const rev = findReview(numberOrNull(payload.review_id));
      if (!rev) fail('BAD_INPUT', 'review not found');
      evPayload = {
        review_id: rev.id,
        verdict: rev.verdict,
        score: rev.score,
        needs_master_review: rev.needs_master_review,
      };
      if (rev.verdict === 'rework' && !rev.needs_master_review) {
        to = 'rework';
        const top = rev.checks.find((c) => c.status === 'fail')?.message_ru ?? 'низкая оценка ИИ';
        o = {
          ...o,
          status: to,
          ai_review_id: rev.id,
          rework_count: o.rework_count + 1,
          due_at: reworkDueAt(o, now),
        };
        notes.push({ to: order.assignee_id, kind: 'rework', vars: { top_reason: top } });
        notes.push({ to: order.master_id, kind: 'review_rework', vars: { top_reason: top } });
      } else {
        to = 'ai_review';
        o = { ...o, ai_review_id: rev.id };
        const label = VERDICT_LABEL[rev.verdict];
        notes.push({ to: order.assignee_id, kind: 'report', vars: { verdict_label: label, score: rev.score } });
        notes.push({
          to: order.master_id,
          kind: 'review_ready',
          vars: { verdict_label: label, score: rev.score, unsure: rev.needs_master_review },
        });
      }
      break;
    }

    case 'close': {
      requireFrom(['ai_review', 'rework']);
      const rev = findReview(o.ai_review_id);
      const fv = emptyToNull(payload.final_verdict);
      if (fv != null && !(VERDICTS as readonly string[]).includes(fv)) fail('BAD_INPUT', 'final_verdict');
      const verdict: Verdict | null = (fv as Verdict | null) ?? rev?.verdict ?? null;
      const fsRaw = payload.final_score as unknown;
      const fs = fsRaw == null || fsRaw === '' ? null : Math.trunc(Number(fsRaw));
      if (fs != null && !Number.isFinite(fs)) fail('BAD_INPUT', 'final_score');
      const score: number | null = fs ?? rev?.score ?? null;
      if (verdict == null) fail('MISSING_REASON', 'final_verdict required without an AI review');
      to = 'closed';
      o = { ...o, status: to, closed_at: nowIso, final_verdict: verdict, final_score: score };
      if (rev) {
        effects.push({
          type: 'update_review',
          review_id: rev.id,
          patch: {
            master_verdict: verdict,
            master_score: score,
            master_comment: comment,
            master_id: uid,
            master_decided_at: nowIso,
          },
        });
      }
      evPayload = {
        final_verdict: verdict,
        final_score: score,
        ai_verdict: rev?.verdict ?? null,
        ai_score: rev?.score ?? null,
        changed: rev != null && (rev.verdict !== verdict || rev.score !== score),
      };
      notes.push({
        to: order.assignee_id,
        kind: 'closed',
        vars: { verdict_label: VERDICT_LABEL[verdict], score },
      });
      break;
    }

    case 'return': {
      requireFrom(['ai_review']);
      if (comment == null) fail('MISSING_REASON', 'comment required');
      to = 'rework';
      o = { ...o, status: to, rework_count: o.rework_count + 1, due_at: reworkDueAt(o, now) };
      if (o.ai_review_id != null) {
        effects.push({
          type: 'update_review',
          review_id: o.ai_review_id,
          patch: { master_verdict: 'rework', master_comment: comment, master_id: uid, master_decided_at: nowIso },
        });
      }
      notes.push({ to: order.assignee_id, kind: 'rework', vars: { top_reason: comment } });
      break;
    }

    case 'resume_rework': {
      requireFrom(['rework']);
      ensureSingleInProgress();
      to = 'in_progress';
      // the time between the first submission and the restart counts as a pause, so work time stays honest
      const add = o.done_at == null ? 0 : Math.floor((now.getTime() - ms(o.done_at)) / 1000);
      o = { ...o, status: to, paused_total_sec: o.paused_total_sec + add, paused_since: null };
      break;
    }

    case 'reassign': {
      requireFrom(REASSIGN_FROM);
      const brigadeId = numberOrNull(payload.brigade_id);
      let target = emptyToNull(payload.assignee_id);
      if (target == null && brigadeId != null) {
        target = ctx.brigades?.find((b) => b.id === brigadeId)?.leader_id ?? null;
      }
      const worker = target == null ? undefined : ctx.employees?.find((e) => e.id === target);
      if (!worker || worker.role !== 'worker') fail('BAD_INPUT', 'assignee must be a worker');
      if (!worker.on_shift && payload.allow_off_shift !== true) {
        throw new RotaError('NOT_ON_SHIFT', { details: worker.short_name });
      }
      const prev = order.assignee_id;
      to = 'issued';
      o = {
        ...o,
        status: to,
        assignee_id: worker.id,
        brigade_id: brigadeId,
        issued_at: nowIso,
        accepted_at: null,
        queued_at: null,
        rejected_at: null,
        started_at: null,
        paused_since: null,
        paused_total_sec: 0,
        queue_position: null,
      };
      evPayload = { from_assignee_id: prev, to_assignee_id: worker.id, brigade_id: brigadeId };
      notes.push({ to: worker.id, kind: order.priority === 'emergency' ? 'emergency' : 'new_order', vars: {} });
      if (prev !== worker.id) notes.push({ to: prev, kind: 'reassigned', vars: {} });
      break;
    }

    case 'cancel': {
      if (from === 'closed' || from === 'cancelled') fail('BAD_TRANSITION');
      const r = btrimOrNull(payload.reason) ?? comment;
      if (r == null) fail('MISSING_REASON', 'cancel reason');
      reason = r;
      to = 'cancelled';
      o = { ...o, status: to, cancelled_at: nowIso, queue_position: null, paused_since: null };
      notes.push({ to: order.assignee_id, kind: 'cancelled', vars: { reason: r } });
      break;
    }

    case 'set_priority': {
      requireFrom(ACTIVE_STATUSES);
      const p = emptyToNull(payload.priority);
      if (p == null) fail('BAD_INPUT', 'priority required');
      if (!(PRIORITIES as readonly string[]).includes(p)) fail('BAD_INPUT', 'invalid priority');
      const priority = p as Priority;
      to = from;
      o = { ...o, priority };
      evPayload = { from_priority: order.priority, to_priority: priority };
      if (priority === 'emergency' && order.priority !== 'emergency') {
        notes.push({ to: order.assignee_id, kind: 'emergency', vars: {} });
      }
      break;
    }

    case 'mark_reject_justified': {
      const eventId = numberOrNull(payload.reject_event_id);
      if (eventId == null || !orderEvents.some((e) => e.id === eventId && e.action === 'reject')) {
        fail('BAD_INPUT', 'reject event not found');
      }
      to = from;
      evPayload = { justified: true, reject_event_id: eventId };
      break;
    }
  }

  if (comment != null) o = { ...o, last_comment: comment };

  const events: NewOrderEvent[] = [
    ...before,
    {
      order_id: order.id,
      actor_id: system ? null : uid,
      action,
      from_status: from,
      to_status: to,
      reason,
      comment,
      payload: evPayload,
      client_action_id: clientActionId,
      created_at: nowIso,
    },
  ];
  const mainEvent = before.length;

  // complete: the second step (done → ai_review) is a system event in the same transaction
  if (action === 'complete') {
    o = { ...o, status: 'ai_review' };
    events.push({
      order_id: order.id,
      actor_id: null,
      action: 'review_started',
      from_status: 'done',
      to_status: 'ai_review',
      reason: null,
      comment: null,
      payload: { attempt: order.rework_count + 1 },
      client_action_id: null,
      created_at: nowIso,
    });
    effects.push({ type: 'ai_verify', order_id: order.id });
  }

  for (const c of changed) effects.unshift({ type: 'update_order', order: c });

  const after = mergeOrders(orders, [...changed, o]);
  effects.push({
    type: 'equipment_stopped',
    equipment_id: o.equipment_id,
    is_stopped: equipmentIsStopped(o.equipment_id, after),
  });

  for (const n of notes) {
    if (n.to == null) continue;
    effects.push({ type: 'notify', recipient_id: n.to, order_id: o.id, kind: n.kind, key: n.kind, vars: n.vars });
  }

  return { order: o, events, main_event: mainEvent, sideEffects: effects, replayed: false };
}

// ---------------------------------------------------------------------------
// applyCreate (public.create_order)
// ---------------------------------------------------------------------------

export interface CreateContext {
  actor: Actor | 'system';
  now: Date;
  clientActionId?: Uuid | null;
  /** Id and number for the new order (the store's identity and order_number_seq). */
  nextId: number;
  nextNumber: number;
  /** Every order: idempotency by client_ref, the repeat failure link, the equipment stop. */
  orders?: readonly Order[];
  /** Every event: idempotency by client_action_id. */
  events?: readonly Pick<OrderEvent, 'order_id' | 'client_action_id'>[];
  employees?: readonly Pick<Employee, 'id' | 'role' | 'on_shift' | 'short_name'>[];
  brigades?: readonly Pick<Brigade, 'id' | 'leader_id'>[];
  equipment?: readonly Pick<Equipment, 'id' | 'area_id'>[];
  work_norms?: readonly Pick<WorkNorm, 'fault_code' | 'norm_hours'>[];
  /** settings.demo_mode marks the order is_demo. */
  settings?: Pick<Settings, 'demo_mode'>;
  /** Fallback client_ref when the input has none (gen_random_uuid()). */
  uuid?: () => Uuid;
}

/** The deadline rule of create_order: due_at, else due_in_min, else the norm, else by priority. */
export function createDueAt(
  input: Pick<CreateOrderInput, 'due_at' | 'due_in_min'>,
  normHours: number | null,
  priority: Priority,
  now: Date,
): string {
  const dueAt = emptyToNull(input.due_at);
  if (dueAt != null) return iso(ms(dueAt));
  const inMin = numberOrNull(input.due_in_min);
  if (inMin != null) return iso(now.getTime() + inMin * 60_000);
  if (normHours != null) return iso(now.getTime() + normHours * 3_600_000);
  return iso(now.getTime() + PRIORITY_DEFAULT_HOURS[priority] * 3_600_000);
}

/** orders_repeat_link: an unplanned order on a unit repaired in the previous 7 days (same code or no code yet). */
export function repeatOfOrderId(
  order: Pick<Order, 'type' | 'equipment_id' | 'created_at' | 'suggested_fault_code'>,
  orders: readonly Pick<Order, 'id' | 'equipment_id' | 'status' | 'done_at' | 'fault_code'>[],
): number | null {
  if (order.type !== 'unplanned') return null;
  const created = ms(order.created_at);
  const weekMs = 7 * 24 * 3_600_000;
  let best: { id: number; done: number } | null = null;
  for (const x of orders) {
    if (x.equipment_id !== order.equipment_id || x.done_at == null) continue;
    if (!['done', 'ai_review', 'rework', 'closed'].includes(x.status)) continue;
    const done = ms(x.done_at);
    if (done < created - weekMs || done > created) continue;
    if (order.suggested_fault_code != null && x.fault_code !== order.suggested_fault_code) continue;
    if (best == null || done > best.done) best = { id: x.id, done };
  }
  return best?.id ?? null;
}

/**
 * create_order as a pure function: validates like the SQL (FORBIDDEN, BAD_INPUT, NOT_ON_SHIFT), returns the
 * new order, its create event and the side effects (attach before photos, equipment stop, new_order or
 * emergency notification with key «new»). A known client_action_id or client_ref returns that order.
 */
export function applyCreate(input: CreateOrderInput, ctx: CreateContext): ActionResult {
  const { actor, now } = ctx;
  const nowIso = now.toISOString();
  const orders = ctx.orders ?? [];
  const clientActionId = ctx.clientActionId ?? null;

  const typeRaw = emptyToNull(input.type) ?? 'unplanned';
  const priorityRaw = emptyToNull(input.priority) ?? 'normal';
  if (!(ORDER_TYPES as readonly string[]).includes(typeRaw)) fail('BAD_INPUT', 'invalid type');
  if (!(PRIORITIES as readonly string[]).includes(priorityRaw)) fail('BAD_INPUT', 'invalid priority');
  const type = typeRaw as OrderType;
  const priority = priorityRaw as Priority;

  if (actor === 'system' || !isMasterRole(actor.role)) fail('FORBIDDEN', 'only a master');
  const uid = actor.user_id;

  // idempotency: by client_action_id, then by client_ref
  if (clientActionId != null) {
    const ev = ctx.events?.find((e) => e.client_action_id === clientActionId);
    const existing = ev ? orders.find((x) => x.id === ev.order_id) : undefined;
    if (existing) return { order: existing, events: [], main_event: -1, sideEffects: [], replayed: true };
  }
  const clientRef = emptyToNull(input.client_ref) ?? ctx.uuid?.() ?? null;
  if (clientRef == null) fail('BAD_INPUT', 'client_ref required');
  const byRef = orders.find((x) => x.client_ref === clientRef);
  if (byRef) return { order: byRef, events: [], main_event: -1, sideEffects: [], replayed: true };

  const description = btrimOrNull(input.description);
  const comment = btrimOrNull(input.comment);
  const equipmentId = numberOrNull(input.equipment_id);
  const eq = equipmentId == null ? undefined : ctx.equipment?.find((e) => e.id === equipmentId);
  if (description == null || !eq) fail('BAD_INPUT', 'description and equipment required');

  const brigadeId = numberOrNull(input.brigade_id);
  let assigneeId = emptyToNull(input.assignee_id);
  if (assigneeId == null && brigadeId != null) {
    assigneeId = ctx.brigades?.find((b) => b.id === brigadeId)?.leader_id ?? null;
  }
  const worker = assigneeId == null ? undefined : ctx.employees?.find((e) => e.id === assigneeId);
  if (!worker || worker.role !== 'worker') fail('BAD_INPUT', 'assignee must be a worker');
  if (!worker.on_shift && input.allow_off_shift !== true) {
    throw new RotaError('NOT_ON_SHIFT', { details: worker.short_name });
  }

  const code = emptyToNull(input.suggested_fault_code);
  const norm =
    numberOrNull(input.norm_hours) ??
    (code == null ? null : (ctx.work_norms?.find((n) => n.fault_code === code)?.norm_hours ?? null));
  const dueAt = createDueAt(input, norm, priority, now);

  let order: Order = {
    id: ctx.nextId,
    number: ctx.nextNumber,
    client_ref: clientRef,
    type,
    priority,
    description,
    comment,
    area_id: eq.area_id,
    equipment_id: eq.id,
    assignee_id: worker.id,
    brigade_id: brigadeId,
    master_id: uid,
    status: 'issued',
    due_at: dueAt,
    norm_hours: norm,
    equipment_stopped: input.equipment_stopped === true,
    suggested_fault_code: code,
    queue_position: null,
    works_done: null,
    fault_code: null,
    closing_comment: null,
    created_at: nowIso,
    issued_at: nowIso,
    accepted_at: null,
    queued_at: null,
    rejected_at: null,
    started_at: null,
    done_at: null,
    closed_at: null,
    cancelled_at: null,
    paused_since: null,
    paused_total_sec: 0,
    last_comment: comment,
    rework_count: 0,
    ai_review_id: null,
    final_verdict: null,
    final_score: null,
    repeat_of_order_id: null,
    is_demo: ctx.settings?.demo_mode === true,
  };
  order = { ...order, repeat_of_order_id: repeatOfOrderId(order, orders) };

  const event: NewOrderEvent = {
    order_id: order.id,
    actor_id: uid,
    action: 'create',
    from_status: null,
    to_status: 'issued',
    reason: null,
    comment,
    payload: {
      assignee_id: worker.id,
      brigade_id: brigadeId,
      priority,
      type,
      due_at: dueAt,
      equipment_stopped: order.equipment_stopped,
    },
    client_action_id: clientActionId,
    created_at: nowIso,
  };

  const sideEffects: SideEffect[] = [
    { type: 'attach_photos', client_ref: clientRef, order_id: order.id },
    {
      type: 'equipment_stopped',
      equipment_id: eq.id,
      is_stopped: equipmentIsStopped(eq.id, [...orders, order]),
    },
    {
      type: 'notify',
      recipient_id: worker.id,
      order_id: order.id,
      kind: priority === 'emergency' ? 'emergency' : 'new_order',
      key: 'new',
      vars: {},
    },
  ];

  return { order, events: [event], main_event: 0, sideEffects, replayed: false };
}
