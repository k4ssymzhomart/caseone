// The order state machine of CLAUDE.md §6, row by row, against applyAction / applyCreate / allowedActions.
// The expectations are written out by hand from the §6 table and the «Details that the SQL and
// transitions.ts share» block; parity.test.ts checks the same functions against supabase/tests/transitions.json.

import { describe, expect, it } from 'vitest';
import { RotaError } from '../api/errors';
import { brigades, employees as fixtureEmployees, equipment, mockEmployeeId, workNorms } from '../fixtures';
import { STATUSES, type OrderAction, type Role, type Status } from './enums';
import {
  allowedActions,
  applyAction,
  applyCreate,
  canPerform,
  equipmentIsStopped,
  notificationDedupeKey,
  reworkDueAt,
  TRANSITIONS,
  type ActionContext,
  type ActionResult,
  type Actor,
  type CreateContext,
  type SideEffect,
  type SystemActionPayload,
} from './transitions';
import type { AiCheck, AiReview, CreateOrderInput, Employee, Order, OrderEvent } from './types';

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

const NOW = new Date('2026-10-08T06:00:00.000Z'); // 11:00 Asia/Qostanay
const at = (minutes: number): string => new Date(NOW.getTime() + minutes * 60_000).toISOString();

const id = mockEmployeeId;
const MASTER: Actor = { user_id: id('1001'), role: 'master' };
const ADMIN: Actor = { user_id: id('9001'), role: 'admin' };
const MANAGER: Actor = { user_id: id('3001'), role: 'manager' };
const W1: Actor = { user_id: id('2001'), role: 'worker' }; // Ахметов, the assignee
const W2: Actor = { user_id: id('2002'), role: 'worker' }; // Иванов
const OFF = id('2004'); // Литвиненко, off shift

const ON_SHIFT = new Set([id('2001'), id('2002'), id('2006'), id('2007')]);
const staff: Employee[] = fixtureEmployees.map((e) => ({ ...e, on_shift: ON_SHIFT.has(e.id) }));

const PUMP = 20; // Насос НШ-32 маслостанции, area 3

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 1,
    number: 101,
    client_ref: '11111111-1111-4111-8111-111111111111',
    type: 'unplanned',
    priority: 'high',
    description: 'Течь масла',
    comment: null,
    area_id: 3,
    equipment_id: PUMP,
    assignee_id: W1.user_id,
    brigade_id: null,
    master_id: MASTER.user_id,
    status: 'issued',
    due_at: at(120),
    norm_hours: 1.5,
    equipment_stopped: false,
    suggested_fault_code: 'Г-01',
    queue_position: null,
    works_done: null,
    fault_code: null,
    closing_comment: null,
    created_at: at(-60),
    issued_at: at(-60),
    accepted_at: null,
    queued_at: null,
    rejected_at: null,
    started_at: null,
    done_at: null,
    closed_at: null,
    cancelled_at: null,
    paused_since: null,
    paused_total_sec: 0,
    last_comment: null,
    rework_count: 0,
    ai_review_id: null,
    final_verdict: null,
    final_score: null,
    repeat_of_order_id: null,
    is_demo: false,
    ...overrides,
  };
}

function check(id: string, status: AiCheck['status'], message_ru = ''): AiCheck {
  return { id, title: id, status, points: 0, max: 20, message_ru };
}

function makeReview(overrides: Partial<AiReview> = {}): AiReview {
  return {
    id: 900,
    order_id: 1,
    attempt: 1,
    verdict: 'accepted',
    score: 88,
    score5: 4,
    confidence: 0.86,
    needs_master_review: false,
    checks: [check('R1', 'pass'), check('R2', 'pass')],
    photo: null,
    feedback_worker: null,
    report_master: null,
    model: 'mock',
    latency_ms: 10,
    created_at: at(-1),
    master_verdict: null,
    master_score: null,
    master_comment: null,
    master_id: null,
    master_decided_at: null,
    ...overrides,
  };
}

function rejectEvent(overrides: Partial<OrderEvent> = {}): OrderEvent {
  return {
    id: 501,
    order_id: 1,
    actor_id: W1.user_id,
    action: 'reject',
    from_status: 'issued',
    to_status: 'rejected',
    reason: 'no_permit',
    comment: null,
    payload: {},
    client_action_id: null,
    created_at: at(-30),
    ...overrides,
  };
}

/** An order in `status` with the fields that status implies. */
function orderIn(status: Status, overrides: Partial<Order> = {}): Order {
  const base: Partial<Order> = { status };
  if (status !== 'issued') base.accepted_at = at(-50);
  if (['in_progress', 'paused', 'done', 'ai_review', 'rework', 'closed'].includes(status)) {
    base.started_at = at(-45);
  }
  if (status === 'paused') base.paused_since = at(-10);
  if (status === 'queued') base.queue_position = 1;
  if (['done', 'ai_review', 'rework', 'closed'].includes(status)) {
    base.done_at = at(-5);
    base.ai_review_id = 900;
  }
  return makeOrder({ ...base, ...overrides });
}

function ctx(actor: Actor | 'system', extra: Partial<ActionContext> = {}): ActionContext {
  return {
    actor,
    now: NOW,
    employees: staff,
    brigades,
    reviews: [makeReview()],
    events: [rejectEvent()],
    ...extra,
  };
}

/** A payload that satisfies every rule of the action. */
const VALID: Record<OrderAction | 'ai_result', SystemActionPayload> = {
  accept: {},
  queue: {},
  reject: { reason: 'no_permit' },
  start: {},
  pause: { reason: 'waiting_parts' },
  resume: {},
  complete: {
    works_done: 'Заменил кольцо и РВД',
    fault_code: 'Г-01',
    materials: [{ material_id: 21, qty: 2 }],
  },
  ai_result: { review_id: 900 },
  close: {},
  return: { comment: 'Нет фото после' },
  resume_rework: {},
  reassign: { assignee_id: W2.user_id },
  cancel: { reason: 'Ошибочный наряд' },
  set_priority: { priority: 'emergency' },
  mark_reject_justified: { reject_event_id: 501 },
};

function actorFor(action: OrderAction | 'ai_result'): Actor | 'system' {
  const who = TRANSITIONS[action].actor;
  return who === 'assignee' ? W1 : who === 'master' ? MASTER : 'system';
}

function catchError(fn: () => unknown): RotaError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(RotaError);
    return e as RotaError;
  }
  throw new Error('expected a RotaError');
}

function expectCode(fn: () => unknown, code: RotaError['code']): RotaError {
  const e = catchError(fn);
  expect(e.code).toBe(code);
  return e;
}

const effects = <T extends SideEffect['type']>(r: ActionResult, type: T) =>
  r.sideEffects.filter((e): e is Extract<SideEffect, { type: T }> => e.type === type);

const notes = (r: ActionResult) =>
  effects(r, 'notify').map((n) => ({ to: n.recipient_id, kind: n.kind, vars: n.vars }));

// ---------------------------------------------------------------------------
// the §6 table
// ---------------------------------------------------------------------------

const ACTIVE: Status[] = ['issued', 'accepted', 'queued', 'in_progress', 'paused', 'rework'];

/** [action, allowed from, to ('same' keeps the status)] exactly as CLAUDE.md §6 lists them. */
const TABLE: [OrderAction | 'ai_result', Status[], Status | 'same'][] = [
  ['accept', ['issued', 'queued'], 'accepted'],
  ['queue', ['issued'], 'queued'],
  ['reject', ['issued', 'queued', 'accepted'], 'rejected'],
  ['start', ['accepted', 'queued'], 'in_progress'],
  ['pause', ['in_progress'], 'paused'],
  ['resume', ['paused'], 'in_progress'],
  ['complete', ['in_progress'], 'ai_review'],
  ['ai_result', ['ai_review'], 'ai_review'],
  ['close', ['ai_review', 'rework'], 'closed'],
  ['return', ['ai_review'], 'rework'],
  ['resume_rework', ['rework'], 'in_progress'],
  ['reassign', ['issued', 'queued', 'accepted', 'rejected', 'paused', 'in_progress', 'rework'], 'issued'],
  ['cancel', STATUSES.filter((s) => s !== 'closed' && s !== 'cancelled'), 'cancelled'],
  ['set_priority', ACTIVE, 'same'],
  ['mark_reject_justified', [...STATUSES], 'same'],
];

describe('CLAUDE.md §6 table', () => {
  it('covers every action', () => {
    expect(TABLE.map(([a]) => a).sort()).toEqual(
      Object.keys(TRANSITIONS)
        .filter((a) => a !== 'create')
        .sort(),
    );
  });

  for (const [action, from, to] of TABLE) {
    describe(action, () => {
      it(`goes from ${from.join(', ')} to ${to}`, () => {
        for (const status of from) {
          const r = applyAction(orderIn(status), action, VALID[action], ctx(actorFor(action)));
          expect(r.order.status, `${action} from ${status}`).toBe(to === 'same' ? status : to);
          expect(r.replayed).toBe(false);
          const main = r.events[r.main_event];
          expect(main?.action).toBe(action);
          expect(main?.from_status).toBe(status);
        }
      });

      it('raises BAD_TRANSITION from any other status', () => {
        for (const status of STATUSES.filter((s) => !from.includes(s))) {
          expectCode(
            () => applyAction(orderIn(status), action, VALID[action], ctx(actorFor(action))),
            'BAD_TRANSITION',
          );
        }
      });

      it('agrees with TRANSITIONS', () => {
        const tr = TRANSITIONS[action];
        if (!tr.needs_reject_event) expect([...tr.from].sort()).toEqual([...from].sort());
      });
    });
  }

  it('writes one event per status change, two for complete (review_started as system)', () => {
    const r = applyAction(orderIn('in_progress'), 'complete', VALID.complete, {
      ...ctx(W1),
      clientActionId: 'aaaaaaaa-0000-4000-8000-000000000001',
    });
    expect(r.events.map((e) => [e.action, e.from_status, e.to_status, e.actor_id, e.client_action_id])).toEqual([
      ['complete', 'in_progress', 'done', W1.user_id, 'aaaaaaaa-0000-4000-8000-000000000001'],
      ['review_started', 'done', 'ai_review', null, null],
    ]);
    expect(r.events[1]?.payload).toEqual({ attempt: 1 });
  });

  it('ai_result writes actor null', () => {
    const r = applyAction(orderIn('ai_review'), 'ai_result', VALID.ai_result, ctx('system'));
    expect(r.events).toHaveLength(1);
    expect(r.events[0]?.actor_id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// who may act
// ---------------------------------------------------------------------------

describe('FORBIDDEN', () => {
  const assigneeActions: OrderAction[] = [
    'accept',
    'queue',
    'reject',
    'start',
    'pause',
    'resume',
    'complete',
    'resume_rework',
  ];
  const masterActions: OrderAction[] = [
    'close',
    'return',
    'reassign',
    'cancel',
    'set_priority',
    'mark_reject_justified',
  ];
  const fromOf = (a: OrderAction | 'ai_result'): Status => TRANSITIONS[a].from[0] ?? 'issued';

  it('assignee actions: another worker, a master, the system', () => {
    for (const a of assigneeActions) {
      for (const who of [W2, MASTER, ADMIN, 'system'] as const) {
        expectCode(() => applyAction(orderIn(fromOf(a)), a, VALID[a], ctx(who)), 'FORBIDDEN');
      }
    }
  });

  it('master actions: the assignee, a manager, the system; admin may', () => {
    for (const a of masterActions) {
      for (const who of [W1, MANAGER, 'system'] as const) {
        expectCode(() => applyAction(orderIn(fromOf(a)), a, VALID[a], ctx(who)), 'FORBIDDEN');
      }
      expect(() => applyAction(orderIn(fromOf(a)), a, VALID[a], ctx(ADMIN))).not.toThrow();
    }
  });

  it('ai_result only for the system', () => {
    for (const who of [W1, MASTER, ADMIN]) {
      const e = expectCode(
        () => applyAction(orderIn('ai_review'), 'ai_result', VALID.ai_result, ctx(who)),
        'FORBIDDEN',
      );
      expect(e.details).toBe('system action');
    }
  });

  it('is checked before the status', () => {
    expectCode(() => applyAction(orderIn('issued'), 'close', {}, ctx(W1)), 'FORBIDDEN');
    expectCode(() => applyAction(orderIn('closed'), 'accept', {}, ctx(W2)), 'FORBIDDEN');
  });

  it('create only for master and admin', () => {
    for (const who of [W1, MANAGER, 'system'] as const) {
      expectCode(() => applyCreate(createInput(), createCtx({ actor: who })), 'FORBIDDEN');
    }
    expect(applyCreate(createInput(), createCtx({ actor: ADMIN })).order.master_id).toBe(ADMIN.user_id);
  });
});

// ---------------------------------------------------------------------------
// reasons
// ---------------------------------------------------------------------------

describe('MISSING_REASON', () => {
  it('reject needs a reject_t reason, and a comment for other', () => {
    expectCode(() => applyAction(orderIn('issued'), 'reject', {}, ctx(W1)), 'MISSING_REASON');
    expectCode(
      () => applyAction(orderIn('issued'), 'reject', { reason: 'waiting_parts' }, ctx(W1)),
      'MISSING_REASON',
    );
    expectCode(() => applyAction(orderIn('issued'), 'reject', { reason: 'other' }, ctx(W1)), 'MISSING_REASON');
    expectCode(
      () => applyAction(orderIn('issued'), 'reject', { reason: 'other', comment: '   ' }, ctx(W1)),
      'MISSING_REASON',
    );
    const r = applyAction(
      orderIn('issued'),
      'reject',
      { reason: 'other', comment: 'Нужен кран' },
      ctx(W1),
    );
    expect(r.order.status).toBe('rejected');
    expect(r.events[0]?.reason).toBe('other');
  });

  it('pause needs a pause_t reason', () => {
    expectCode(() => applyAction(orderIn('in_progress'), 'pause', {}, ctx(W1)), 'MISSING_REASON');
    expectCode(
      () => applyAction(orderIn('in_progress'), 'pause', { reason: 'no_permit' }, ctx(W1)),
      'MISSING_REASON',
    );
    const r = applyAction(orderIn('in_progress'), 'pause', { reason: 'waiting_stop' }, ctx(W1));
    expect(r.events[0]?.reason).toBe('waiting_stop');
  });

  it('return needs a comment', () => {
    expectCode(() => applyAction(orderIn('ai_review'), 'return', {}, ctx(MASTER)), 'MISSING_REASON');
    expectCode(
      () => applyAction(orderIn('ai_review'), 'return', { comment: '  ' }, ctx(MASTER)),
      'MISSING_REASON',
    );
  });

  it('cancel needs a reason (the comment counts)', () => {
    expectCode(() => applyAction(orderIn('issued'), 'cancel', {}, ctx(MASTER)), 'MISSING_REASON');
    const r = applyAction(orderIn('issued'), 'cancel', { comment: 'Дубль' }, ctx(MASTER));
    expect(r.order.status).toBe('cancelled');
    expect(r.events[0]?.reason).toBe('Дубль');
  });

  it('close without a review needs final_verdict', () => {
    const o = orderIn('rework', { ai_review_id: null });
    expectCode(() => applyAction(o, 'close', {}, ctx(MASTER)), 'MISSING_REASON');
    const r = applyAction(o, 'close', { final_verdict: 'accepted', final_score: 80 }, ctx(MASTER));
    expect(r.order.final_verdict).toBe('accepted');
    expect(r.order.final_score).toBe(80);
    expect(effects(r, 'update_review')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// one order in progress per worker
// ---------------------------------------------------------------------------

describe('ANOTHER_IN_PROGRESS', () => {
  const running = orderIn('in_progress', { id: 2, number: 102, priority: 'normal', started_at: at(-30) });

  for (const [action, status] of [
    ['start', 'accepted'],
    ['start', 'queued'],
    ['resume', 'paused'],
    ['resume_rework', 'rework'],
  ] as const) {
    it(`${action} from ${status} raises it without pause_current`, () => {
      const e = expectCode(
        () => applyAction(orderIn(status), action, {}, ctx(W1, { orders: [running] })),
        'ANOTHER_IN_PROGRESS',
      );
      expect(e.details).toEqual({ order_id: 2, number: 102 });
      expect(e.message).toBe('Приостановить наряд №102 и начать этот?');
    });

    it(`${action} from ${status} pauses the other order with pause_current`, () => {
      const r = applyAction(
        orderIn(status),
        action,
        { pause_current: true },
        ctx(W1, { orders: [running] }),
      );
      expect(r.order.status).toBe('in_progress');
      const [paused] = effects(r, 'update_order');
      expect(paused?.order).toMatchObject({
        id: 2,
        status: 'paused',
        paused_since: NOW.toISOString(),
        last_comment: 'Переключился на наряд №101',
      });
      expect(r.main_event).toBe(1);
      expect(r.events[0]).toMatchObject({
        order_id: 2,
        actor_id: W1.user_id,
        action: 'pause',
        from_status: 'in_progress',
        to_status: 'paused',
        reason: 'other',
        comment: 'Переключился на наряд №101',
        payload: { auto: true, for_order_id: 1 },
        client_action_id: null,
      });
      expect(r.events[1]?.action).toBe(action);
    });
  }

  it('an emergency order pauses with «Аварийный наряд №…»', () => {
    const r = applyAction(
      orderIn('accepted', { priority: 'emergency' }),
      'start',
      { pause_current: true },
      ctx(W1, { orders: [running] }),
    );
    expect(effects(r, 'update_order')[0]?.order.last_comment).toBe('Аварийный наряд №101');
  });

  it("another worker's order in progress does not count", () => {
    const theirs = { ...running, assignee_id: W2.user_id };
    expect(() => applyAction(orderIn('accepted'), 'start', {}, ctx(W1, { orders: [theirs] }))).not.toThrow();
  });

  it('pauses the most recently started one', () => {
    const older = orderIn('in_progress', { id: 3, number: 103, started_at: at(-120) });
    const r = applyAction(
      orderIn('accepted'),
      'start',
      { pause_current: true },
      ctx(W1, { orders: [older, running] }),
    );
    expect(effects(r, 'update_order')[0]?.order.id).toBe(2);
  });

  it('BAD_TRANSITION wins over ANOTHER_IN_PROGRESS', () => {
    expectCode(() => applyAction(orderIn('issued'), 'start', {}, ctx(W1, { orders: [running] })), 'BAD_TRANSITION');
  });
});

// ---------------------------------------------------------------------------
// shift, input
// ---------------------------------------------------------------------------

describe('NOT_ON_SHIFT and BAD_INPUT', () => {
  it('reassign to a worker off shift unless allow_off_shift', () => {
    const e = expectCode(
      () => applyAction(orderIn('issued'), 'reassign', { assignee_id: OFF }, ctx(MASTER)),
      'NOT_ON_SHIFT',
    );
    expect(e.details).toBe('Литвиненко О.');
    expect(e.message).toBe('Литвиненко О. не на смене. Всё равно выдать?');
    const r = applyAction(
      orderIn('issued'),
      'reassign',
      { assignee_id: OFF, allow_off_shift: true },
      ctx(MASTER),
    );
    expect(r.order.assignee_id).toBe(OFF);
  });

  it('reassign to a non worker or nobody', () => {
    expectCode(
      () => applyAction(orderIn('issued'), 'reassign', { assignee_id: MASTER.user_id }, ctx(MASTER)),
      'BAD_INPUT',
    );
    expectCode(() => applyAction(orderIn('issued'), 'reassign', {}, ctx(MASTER)), 'BAD_INPUT');
  });

  it('set_priority needs a priority', () => {
    expectCode(() => applyAction(orderIn('issued'), 'set_priority', {}, ctx(MASTER)), 'BAD_INPUT');
  });

  it('ai_result needs a review of this order', () => {
    expectCode(
      () => applyAction(orderIn('ai_review'), 'ai_result', { review_id: 999 }, ctx('system')),
      'BAD_INPUT',
    );
    expectCode(
      () =>
        applyAction(
          orderIn('ai_review'),
          'ai_result',
          { review_id: 900 },
          ctx('system', { reviews: [makeReview({ order_id: 7 })] }),
        ),
      'BAD_INPUT',
    );
  });

  it('mark_reject_justified needs a reject event of this order', () => {
    expectCode(
      () => applyAction(orderIn('rejected'), 'mark_reject_justified', { reject_event_id: 501 }, ctx(MASTER, { events: [] })),
      'BAD_INPUT',
    );
    expectCode(
      () =>
        applyAction(
          orderIn('rejected'),
          'mark_reject_justified',
          { reject_event_id: 501 },
          ctx(MASTER, { events: [rejectEvent({ action: 'pause' })] }),
        ),
      'BAD_INPUT',
    );
  });
});

// ---------------------------------------------------------------------------
// side effects
// ---------------------------------------------------------------------------

describe('side effects', () => {
  it('accept: accepted_at, queue cleared, shift switched on', () => {
    const offWorker = staff.map((e) => (e.id === W1.user_id ? { ...e, on_shift: false } : e));
    const r = applyAction(orderIn('queued'), 'accept', {}, ctx(W1, { employees: offWorker }));
    expect(r.order).toMatchObject({ status: 'accepted', accepted_at: at(-50), queue_position: null });
    expect(effects(r, 'set_on_shift')).toEqual([{ type: 'set_on_shift', employee_id: W1.user_id, on_shift: true }]);
    const fresh = applyAction(orderIn('issued'), 'accept', {}, ctx(W1));
    expect(fresh.order.accepted_at).toBe(NOW.toISOString());
    expect(effects(fresh, 'set_on_shift')).toHaveLength(0); // already on shift
  });

  it('queue: position = max + 1 among the assignee’s queued orders', () => {
    const queued = [
      orderIn('queued', { id: 5, queue_position: 2 }),
      orderIn('queued', { id: 6, queue_position: 4, assignee_id: W2.user_id }),
    ];
    const r = applyAction(orderIn('issued'), 'queue', {}, ctx(W1, { orders: queued }));
    expect(r.order).toMatchObject({ status: 'queued', queued_at: NOW.toISOString(), queue_position: 3 });
    expect(applyAction(orderIn('issued'), 'queue', {}, ctx(W1)).order.queue_position).toBe(1);
  });

  it('reject: rejected_at, notifies the master with the reason label', () => {
    const r = applyAction(orderIn('accepted'), 'reject', { reason: 'no_materials' }, ctx(W1));
    expect(r.order).toMatchObject({ status: 'rejected', rejected_at: NOW.toISOString(), queue_position: null });
    expect(notes(r)).toEqual([{ to: MASTER.user_id, kind: 'rejected', vars: { reason_label: 'Нет материалов' } }]);
    const other = applyAction(orderIn('issued'), 'reject', { reason: 'other', comment: 'Нужен кран' }, ctx(W1));
    expect(notes(other)[0]?.vars.reason_label).toBe('Другое: нужен кран');
    expect(other.order.last_comment).toBe('Нужен кран');
  });

  it('start: started_at only the first time, accepted_at from queued, shift on', () => {
    const r = applyAction(orderIn('queued', { accepted_at: null }), 'start', {}, ctx(W1));
    expect(r.order).toMatchObject({
      status: 'in_progress',
      started_at: NOW.toISOString(),
      accepted_at: NOW.toISOString(),
      queue_position: null,
    });
    const again = applyAction(orderIn('accepted', { started_at: at(-200) }), 'start', {}, ctx(W1));
    expect(again.order.started_at).toBe(at(-200));
  });

  it('pause and resume: paused_since, paused_total_sec += elapsed seconds', () => {
    const p = applyAction(orderIn('in_progress'), 'pause', { reason: 'waiting_parts' }, ctx(W1));
    expect(p.order.paused_since).toBe(NOW.toISOString());
    const r = applyAction(orderIn('paused', { paused_total_sec: 100 }), 'resume', {}, ctx(W1));
    expect(r.order).toMatchObject({ status: 'in_progress', paused_since: null, paused_total_sec: 100 + 600 });
  });

  it('complete: done_at, fields, materials replaced (qty > 0), ai_review_id cleared, ai-verify', () => {
    const r = applyAction(
      orderIn('in_progress', { ai_review_id: 899 }),
      'complete',
      {
        works_done: '  Заменил кольцо  ',
        fault_code: 'Г-01',
        materials: [
          { material_id: 21, qty: 2 },
          { material_id: 17, qty: 0 },
          { material_id: 39, qty: 1 },
        ],
        comment: 'Течь устранена',
      },
      ctx(W1),
    );
    expect(r.order).toMatchObject({
      status: 'ai_review',
      done_at: NOW.toISOString(),
      works_done: 'Заменил кольцо',
      fault_code: 'Г-01',
      closing_comment: 'Течь устранена',
      last_comment: 'Течь устранена',
      ai_review_id: null,
    });
    expect(effects(r, 'replace_materials')[0]?.lines).toEqual([
      { material_id: 21, qty: 2 },
      { material_id: 39, qty: 1 },
    ]);
    expect(effects(r, 'ai_verify')).toEqual([{ type: 'ai_verify', order_id: 1 }]);
    expect(r.events[0]?.payload).toMatchObject({ works_done: '  Заменил кольцо  ', no_materials: false });
  });

  it('complete allows missing photo and fields: the AI judges completeness', () => {
    const r = applyAction(orderIn('in_progress'), 'complete', {}, ctx(W1));
    expect(r.order).toMatchObject({ status: 'ai_review', works_done: null, fault_code: null });
    expect(effects(r, 'replace_materials')[0]?.lines).toEqual([]);
  });

  it('ai_result rework: rework_count + 1, deadline extended, worker and master notified', () => {
    const review = makeReview({
      verdict: 'rework',
      score: 45,
      checks: [check('R1', 'fail', 'нет фото после: обязательно для внеплановых работ'), check('R3', 'fail', 'перерасход')],
    });
    const o = orderIn('ai_review', { due_at: at(-10), norm_hours: 3 });
    const r = applyAction(o, 'ai_result', { review_id: 900 }, ctx('system', { reviews: [review] }));
    expect(r.order).toMatchObject({ status: 'rework', ai_review_id: 900, rework_count: 1, due_at: at(90) });
    expect(notes(r)).toEqual([
      { to: W1.user_id, kind: 'rework', vars: { top_reason: 'нет фото после: обязательно для внеплановых работ' } },
      { to: MASTER.user_id, kind: 'review_rework', vars: { top_reason: 'нет фото после: обязательно для внеплановых работ' } },
    ]);
    expect(r.events[0]?.payload).toEqual({ review_id: 900, verdict: 'rework', score: 45, needs_master_review: false });
  });

  it('ai_result rework without a failed check uses «низкая оценка ИИ»', () => {
    const review = makeReview({ verdict: 'rework', score: 50 });
    const r = applyAction(orderIn('ai_review'), 'ai_result', { review_id: 900 }, ctx('system', { reviews: [review] }));
    expect(notes(r)[0]?.vars.top_reason).toBe('низкая оценка ИИ');
  });

  it('ai_result accepted stays in ai_review: report to the worker, review_ready to the master', () => {
    const r = applyAction(orderIn('ai_review', { ai_review_id: null }), 'ai_result', { review_id: 900 }, ctx('system'));
    expect(r.order).toMatchObject({ status: 'ai_review', ai_review_id: 900, rework_count: 0 });
    expect(notes(r)).toEqual([
      { to: W1.user_id, kind: 'report', vars: { verdict_label: 'Принято', score: 88 } },
      { to: MASTER.user_id, kind: 'review_ready', vars: { verdict_label: 'Принято', score: 88, unsure: false } },
    ]);
  });

  it('ai_result rework that needs the master stays in ai_review (unsure)', () => {
    const review = makeReview({ verdict: 'rework', needs_master_review: true });
    const r = applyAction(orderIn('ai_review'), 'ai_result', { review_id: 900 }, ctx('system', { reviews: [review] }));
    expect(r.order.status).toBe('ai_review');
    expect(notes(r)[1]?.vars.unsure).toBe(true);
  });

  it('rework deadline: greatest(due_at, now + greatest(30 min, 0.5 × norm))', () => {
    expect(reworkDueAt({ due_at: at(-10), norm_hours: 3 }, NOW)).toBe(at(90));
    expect(reworkDueAt({ due_at: at(-10), norm_hours: 0.5 }, NOW)).toBe(at(30));
    expect(reworkDueAt({ due_at: at(-10), norm_hours: null }, NOW)).toBe(at(30));
    expect(reworkDueAt({ due_at: at(300), norm_hours: 3 }, NOW)).toBe(at(300));
  });

  it('close defaults to the AI verdict and score, records the master decision, notifies the worker', () => {
    const r = applyAction(orderIn('ai_review'), 'close', { comment: 'Хорошо' }, ctx(MASTER));
    expect(r.order).toMatchObject({
      status: 'closed',
      closed_at: NOW.toISOString(),
      final_verdict: 'accepted',
      final_score: 88,
      last_comment: 'Хорошо',
    });
    expect(effects(r, 'update_review')).toEqual([
      {
        type: 'update_review',
        review_id: 900,
        patch: {
          master_verdict: 'accepted',
          master_score: 88,
          master_comment: 'Хорошо',
          master_id: MASTER.user_id,
          master_decided_at: NOW.toISOString(),
        },
      },
    ]);
    expect(r.events[0]?.payload).toEqual({
      final_verdict: 'accepted',
      final_score: 88,
      ai_verdict: 'accepted',
      ai_score: 88,
      changed: false,
    });
    expect(notes(r)).toEqual([{ to: W1.user_id, kind: 'closed', vars: { verdict_label: 'Принято', score: 88 } }]);
  });

  it('close with an override marks changed', () => {
    const r = applyAction(
      orderIn('ai_review'),
      'close',
      { final_verdict: 'accepted_with_remarks', final_score: 70 },
      ctx(MASTER),
    );
    expect(r.order).toMatchObject({ final_verdict: 'accepted_with_remarks', final_score: 70 });
    expect(r.events[0]?.payload.changed).toBe(true);
  });

  it('return: rework, deadline extended, review gets the master decision, worker notified', () => {
    const r = applyAction(
      orderIn('ai_review', { due_at: at(-10), norm_hours: 1.5 }),
      'return',
      { comment: 'Подтяни хомут' },
      ctx(MASTER),
    );
    expect(r.order).toMatchObject({ status: 'rework', rework_count: 1, due_at: at(45), last_comment: 'Подтяни хомут' });
    expect(effects(r, 'update_review')[0]?.patch).toEqual({
      master_verdict: 'rework',
      master_comment: 'Подтяни хомут',
      master_id: MASTER.user_id,
      master_decided_at: NOW.toISOString(),
    });
    expect(notes(r)).toEqual([{ to: W1.user_id, kind: 'rework', vars: { top_reason: 'Подтяни хомут' } }]);
  });

  it('resume_rework: the time since done counts as a pause', () => {
    const r = applyAction(orderIn('rework', { done_at: at(-20), paused_total_sec: 60 }), 'resume_rework', {}, ctx(W1));
    expect(r.order).toMatchObject({ status: 'in_progress', paused_total_sec: 60 + 1200, paused_since: null });
  });

  it('reassign resets the per assignee fields and notifies both workers', () => {
    const o = orderIn('paused', { paused_total_sec: 500, queue_position: 2, rejected_at: at(-40) });
    const r = applyAction(o, 'reassign', { assignee_id: W2.user_id }, ctx(MASTER));
    expect(r.order).toMatchObject({
      status: 'issued',
      assignee_id: W2.user_id,
      brigade_id: null,
      issued_at: NOW.toISOString(),
      accepted_at: null,
      queued_at: null,
      rejected_at: null,
      started_at: null,
      paused_since: null,
      paused_total_sec: 0,
      queue_position: null,
    });
    expect(r.events[0]?.payload).toEqual({ from_assignee_id: W1.user_id, to_assignee_id: W2.user_id, brigade_id: null });
    expect(notes(r)).toEqual([
      { to: W2.user_id, kind: 'new_order', vars: {} },
      { to: W1.user_id, kind: 'reassigned', vars: {} },
    ]);
  });

  it('reassign to a brigade assigns its leader; an emergency notifies as emergency', () => {
    const r = applyAction(orderIn('rejected', { priority: 'emergency' }), 'reassign', { brigade_id: 2 }, ctx(MASTER));
    expect(r.order).toMatchObject({ assignee_id: id('2007'), brigade_id: 2 });
    expect(notes(r)[0]).toEqual({ to: id('2007'), kind: 'emergency', vars: {} });
  });

  it('reassign to the same worker sends no «reassigned»', () => {
    const r = applyAction(orderIn('rejected'), 'reassign', { assignee_id: W1.user_id }, ctx(MASTER));
    expect(notes(r).map((n) => n.kind)).toEqual(['new_order']);
  });

  it('cancel: cancelled_at, paused_since cleared, assignee notified, equipment released', () => {
    const o = orderIn('paused', { equipment_stopped: true });
    const r = applyAction(o, 'cancel', { reason: 'Ошибочный наряд' }, ctx(MASTER, { orders: [o] }));
    expect(r.order).toMatchObject({ status: 'cancelled', cancelled_at: NOW.toISOString(), paused_since: null });
    expect(notes(r)).toEqual([{ to: W1.user_id, kind: 'cancelled', vars: { reason: 'Ошибочный наряд' } }]);
    expect(effects(r, 'equipment_stopped')).toEqual([{ type: 'equipment_stopped', equipment_id: PUMP, is_stopped: false }]);
  });

  it('set_priority: notifies the assignee only when raised to emergency', () => {
    const up = applyAction(orderIn('accepted'), 'set_priority', { priority: 'emergency' }, ctx(MASTER));
    expect(up.order.priority).toBe('emergency');
    expect(up.order.status).toBe('accepted');
    expect(up.events[0]?.payload).toEqual({ from_priority: 'high', to_priority: 'emergency' });
    expect(notes(up)).toEqual([{ to: W1.user_id, kind: 'emergency', vars: {} }]);
    const down = applyAction(orderIn('accepted'), 'set_priority', { priority: 'normal' }, ctx(MASTER));
    expect(notes(down)).toEqual([]);
  });

  it('mark_reject_justified writes {justified: true} and keeps the status', () => {
    const r = applyAction(orderIn('closed'), 'mark_reject_justified', { reject_event_id: 501 }, ctx(MASTER));
    expect(r.order.status).toBe('closed');
    expect(r.events[0]).toMatchObject({
      action: 'mark_reject_justified',
      from_status: 'closed',
      to_status: 'closed',
      payload: { justified: true, reject_event_id: 501 },
    });
  });

  it('last_comment follows every comment', () => {
    const r = applyAction(orderIn('issued'), 'accept', { comment: 'Иду' }, ctx(W1));
    expect(r.order.last_comment).toBe('Иду');
    expect(r.events[0]?.comment).toBe('Иду');
    expect(applyAction(orderIn('issued', { last_comment: 'было' }), 'accept', {}, ctx(W1)).order.last_comment).toBe('было');
  });

  it('equipment.is_stopped while an order with equipment_stopped is open', () => {
    const o = orderIn('ai_review', { equipment_stopped: true });
    const closed = applyAction(o, 'close', {}, ctx(MASTER, { orders: [o] }));
    expect(effects(closed, 'equipment_stopped')[0]?.is_stopped).toBe(false);
    const other = orderIn('in_progress', { id: 9, equipment_stopped: true, assignee_id: W2.user_id });
    const stillStopped = applyAction(o, 'close', {}, ctx(MASTER, { orders: [o, other] }));
    expect(effects(stillStopped, 'equipment_stopped')[0]?.is_stopped).toBe(true);
    const rework = applyAction(o, 'return', { comment: 'Нет' }, ctx(MASTER, { orders: [o] }));
    expect(effects(rework, 'equipment_stopped')[0]?.is_stopped).toBe(true);
    for (const s of ['issued', 'accepted', 'queued', 'rejected', 'in_progress', 'paused', 'rework'] as const) {
      expect(equipmentIsStopped(PUMP, [{ equipment_id: PUMP, equipment_stopped: true, status: s }])).toBe(true);
    }
    for (const s of ['done', 'ai_review', 'closed', 'cancelled'] as const) {
      expect(equipmentIsStopped(PUMP, [{ equipment_id: PUMP, equipment_stopped: true, status: s }])).toBe(false);
    }
  });

  it('a repeated client_action_id returns the order unchanged', () => {
    const caid = 'bbbbbbbb-0000-4000-8000-000000000002';
    const o = orderIn('accepted');
    const seen = rejectEvent({ id: 600, action: 'accept', client_action_id: caid });
    const r = applyAction(o, 'accept', {}, ctx(W1, { clientActionId: caid, events: [seen] }));
    expect(r).toEqual({ order: o, events: [], main_event: -1, sideEffects: [], replayed: true });
    // the same id on another order is the database's unique violation
    expectCode(
      () => applyAction(o, 'start', {}, ctx(W1, { clientActionId: caid, events: [{ ...seen, order_id: 2 }] })),
      'BAD_INPUT',
    );
  });

  it('notification keys are ev:{event id}:{kind}', () => {
    expect(notificationDedupeKey(42, 'rejected')).toBe('ev:42:rejected');
    const r = applyAction(orderIn('issued'), 'reject', { reason: 'no_permit' }, ctx(W1));
    expect(effects(r, 'notify')[0]?.key).toBe('rejected');
  });
});

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

function createInput(overrides: Partial<CreateOrderInput> = {}): CreateOrderInput {
  return {
    type: 'unplanned',
    priority: 'emergency',
    description: 'Течь масла',
    equipment_id: PUMP,
    assignee_id: W1.user_id,
    client_ref: '22222222-2222-4222-8222-222222222222',
    equipment_stopped: true,
    suggested_fault_code: 'Г-01',
    ...overrides,
  };
}

function createCtx(overrides: Partial<CreateContext> = {}): CreateContext {
  return {
    actor: MASTER,
    now: NOW,
    nextId: 50,
    nextNumber: 148,
    employees: staff,
    brigades,
    equipment,
    work_norms: workNorms,
    settings: { demo_mode: true },
    ...overrides,
  };
}

describe('create', () => {
  it('issues the order with area from the equipment, demo flag and the create event', () => {
    const r = applyCreate(createInput({ area_id: 1, comment: ' Срочно ' }), createCtx({ clientActionId: 'cccccccc-0000-4000-8000-000000000003' }));
    expect(r.order).toMatchObject({
      id: 50,
      number: 148,
      status: 'issued',
      area_id: 3,
      equipment_id: PUMP,
      assignee_id: W1.user_id,
      master_id: MASTER.user_id,
      norm_hours: 1.5,
      due_at: at(90),
      created_at: NOW.toISOString(),
      issued_at: NOW.toISOString(),
      comment: 'Срочно',
      last_comment: 'Срочно',
      equipment_stopped: true,
      is_demo: true,
    });
    expect(r.events).toEqual([
      {
        order_id: 50,
        actor_id: MASTER.user_id,
        action: 'create',
        from_status: null,
        to_status: 'issued',
        reason: null,
        comment: 'Срочно',
        payload: {
          assignee_id: W1.user_id,
          brigade_id: null,
          priority: 'emergency',
          type: 'unplanned',
          due_at: at(90),
          equipment_stopped: true,
        },
        client_action_id: 'cccccccc-0000-4000-8000-000000000003',
        created_at: NOW.toISOString(),
      },
    ]);
    expect(r.sideEffects).toEqual([
      { type: 'attach_photos', client_ref: '22222222-2222-4222-8222-222222222222', order_id: 50 },
      { type: 'equipment_stopped', equipment_id: PUMP, is_stopped: true },
      { type: 'notify', recipient_id: W1.user_id, order_id: 50, kind: 'emergency', key: 'new', vars: {} },
    ]);
  });

  it('a normal order notifies new_order', () => {
    const r = applyCreate(createInput({ priority: 'normal' }), createCtx());
    expect(effects(r, 'notify')[0]?.kind).toBe('new_order');
  });

  it('deadline: due_at, else due_in_min, else norm_hours, else the code norm, else by priority', () => {
    const due = (input: Partial<CreateOrderInput>) => applyCreate(createInput(input), createCtx()).order.due_at;
    expect(due({ due_at: at(15), due_in_min: 1, norm_hours: 5 })).toBe(at(15));
    expect(due({ due_in_min: 1, norm_hours: 5 })).toBe(at(1));
    expect(due({ norm_hours: 5 })).toBe(at(300));
    expect(due({ suggested_fault_code: 'М-02' })).toBe(at(180));
    for (const [priority, hours] of [
      ['emergency', 2],
      ['high', 4],
      ['normal', 8],
      ['planned', 24],
    ] as const) {
      expect(due({ suggested_fault_code: null, priority })).toBe(at(hours * 60));
    }
  });

  it('a brigade order goes to its leader', () => {
    const r = applyCreate(createInput({ assignee_id: undefined, brigade_id: 2 }), createCtx());
    expect(r.order).toMatchObject({ assignee_id: id('2007'), brigade_id: 2 });
  });

  it('NOT_ON_SHIFT unless allow_off_shift', () => {
    const e = expectCode(() => applyCreate(createInput({ assignee_id: OFF }), createCtx()), 'NOT_ON_SHIFT');
    expect(e.details).toBe('Литвиненко О.');
    expect(applyCreate(createInput({ assignee_id: OFF, allow_off_shift: true }), createCtx()).order.assignee_id).toBe(OFF);
  });

  it('BAD_INPUT: no description, no equipment, assignee not a worker', () => {
    expectCode(() => applyCreate(createInput({ description: '  ' }), createCtx()), 'BAD_INPUT');
    expectCode(() => applyCreate(createInput({ equipment_id: 999 }), createCtx()), 'BAD_INPUT');
    expectCode(() => applyCreate(createInput({ assignee_id: MASTER.user_id }), createCtx()), 'BAD_INPUT');
    expectCode(() => applyCreate(createInput({ assignee_id: undefined }), createCtx()), 'BAD_INPUT');
    const e = expectCode(() => applyCreate(createInput({ description: '' }), createCtx()), 'BAD_INPUT');
    expect(e.message).toBe('Проверьте поля наряда');
  });

  it('is idempotent by client_action_id and by client_ref', () => {
    const first = applyCreate(createInput(), createCtx({ clientActionId: 'dddddddd-0000-4000-8000-000000000004' }));
    const store = { orders: [first.order], events: first.events.map((e, i) => ({ ...e, id: i + 1 })) };
    const byCaid = applyCreate(
      createInput({ client_ref: '33333333-3333-4333-8333-333333333333' }),
      createCtx({ ...store, clientActionId: 'dddddddd-0000-4000-8000-000000000004', nextId: 51 }),
    );
    expect(byCaid.replayed).toBe(true);
    expect(byCaid.order.id).toBe(50);
    const byRef = applyCreate(createInput(), createCtx({ ...store, nextId: 51 }));
    expect(byRef.replayed).toBe(true);
    expect(byRef.order.id).toBe(50);
  });

  it('links a repeat failure on the same unit within 7 days', () => {
    const prev = orderIn('closed', { id: 7, done_at: at(-3 * 24 * 60), fault_code: 'Г-01' });
    const old = orderIn('closed', { id: 8, done_at: at(-8 * 24 * 60), fault_code: 'Г-01' });
    const otherCode = orderIn('closed', { id: 9, done_at: at(-60), fault_code: 'М-02' });
    const r = applyCreate(createInput(), createCtx({ orders: [old, prev, otherCode] }));
    expect(r.order.repeat_of_order_id).toBe(7);
    const noCode = applyCreate(createInput({ suggested_fault_code: null }), createCtx({ orders: [old, prev, otherCode] }));
    expect(noCode.order.repeat_of_order_id).toBe(9);
    const planned = applyCreate(createInput({ type: 'planned' }), createCtx({ orders: [prev] }));
    expect(planned.order.repeat_of_order_id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// allowedActions
// ---------------------------------------------------------------------------

describe('allowedActions', () => {
  const WORKER_BUTTONS: Record<Status, OrderAction[]> = {
    issued: ['accept', 'queue', 'reject'],
    accepted: ['reject', 'start'],
    queued: ['accept', 'reject', 'start'],
    rejected: [],
    in_progress: ['pause', 'complete'],
    paused: ['resume'],
    done: [],
    ai_review: [],
    rework: ['resume_rework'],
    closed: [],
    cancelled: [],
  };
  const MASTER_BUTTONS: Record<Status, OrderAction[]> = {
    issued: ['reassign', 'cancel', 'set_priority'],
    accepted: ['reassign', 'cancel', 'set_priority'],
    queued: ['reassign', 'cancel', 'set_priority'],
    rejected: ['reassign', 'cancel'],
    in_progress: ['reassign', 'cancel', 'set_priority'],
    paused: ['reassign', 'cancel', 'set_priority'],
    done: ['cancel'],
    ai_review: ['close', 'return', 'cancel'],
    rework: ['close', 'reassign', 'cancel', 'set_priority'],
    closed: [],
    cancelled: [],
  };

  it('the assignee gets the worker buttons of each status', () => {
    for (const s of STATUSES) expect(allowedActions(orderIn(s), W1), s).toEqual(WORKER_BUTTONS[s]);
  });

  it('another worker gets nothing', () => {
    for (const s of STATUSES) expect(allowedActions(orderIn(s), W2)).toEqual([]);
  });

  it('master and admin get the master buttons; managers and nobody get nothing', () => {
    for (const s of STATUSES) {
      expect(allowedActions(orderIn(s), MASTER), s).toEqual(MASTER_BUTTONS[s]);
      expect(allowedActions(orderIn(s), ADMIN), s).toEqual(MASTER_BUTTONS[s]);
      expect(allowedActions(orderIn(s), MANAGER)).toEqual([]);
      expect(allowedActions(orderIn(s), null)).toEqual([]);
    }
  });

  it('mark_reject_justified needs an unjustified reject event, in any status', () => {
    const events = [rejectEvent()];
    for (const s of STATUSES) {
      expect(allowedActions(orderIn(s), MASTER, { events })).toContain('mark_reject_justified');
      expect(allowedActions(orderIn(s), W1, { events })).not.toContain('mark_reject_justified');
    }
    const justified = [
      ...events,
      rejectEvent({ id: 502, action: 'mark_reject_justified', payload: { justified: true, reject_event_id: 501 } }),
    ];
    expect(allowedActions(orderIn('issued'), MASTER, { events: justified })).not.toContain('mark_reject_justified');
  });

  it('every allowed action applies without BAD_TRANSITION or FORBIDDEN', () => {
    const roles: [Role, Actor][] = [
      ['worker', W1],
      ['master', MASTER],
      ['admin', ADMIN],
    ];
    for (const s of STATUSES) {
      for (const [, who] of roles) {
        for (const a of allowedActions(orderIn(s), who, { events: [rejectEvent()] })) {
          expect(() => applyAction(orderIn(s), a, VALID[a], ctx(who)), `${a} from ${s}`).not.toThrow();
        }
      }
    }
  });

  it('canPerform matches', () => {
    expect(canPerform(orderIn('issued'), 'accept', W1)).toBe(true);
    expect(canPerform(orderIn('issued'), 'accept', MASTER)).toBe(false);
    expect(canPerform(orderIn('ai_review'), 'close', MASTER)).toBe(true);
  });
});
