// Parity with the database (PHASE_1 §7.2): supabase/tests/transitions.json describes the state machine as
// public.order_action / internal.apply_action implement it. TRANSITIONS, allowedActions and applyAction must
// agree with it for every action, status and role.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES, RotaError } from '../api/errors';
import { mockEmployeeId } from '../fixtures';
import { ACTIVE_STATUSES, ORDER_ACTIONS, ROLES, STATUSES, type OrderAction, type Role, type Status } from './enums';
import {
  allowedActions,
  applyAction,
  MASTER_ROLES,
  TRANSITIONS,
  type Actor,
  type SystemActionPayload,
  type TransitionAction,
} from './transitions';
import type { AiReview, Order, OrderEvent } from './types';

interface JsonAction {
  actor: 'assignee' | 'master' | 'system';
  from: Status[] | string;
  to: Status | Status[] | 'same';
  via?: Status;
  requires?: string[];
  comment_required_when_reason?: string;
  single_in_progress?: boolean;
}

interface JsonMachine {
  master_roles: Role[];
  active: Status[];
  actions: Record<string, JsonAction>;
  errors: string[];
}

const machine = JSON.parse(
  readFileSync(new URL('../../../../supabase/tests/transitions.json', import.meta.url), 'utf8'),
) as JsonMachine;

const jsonActions = Object.entries(machine.actions) as [TransitionAction, JsonAction][];
const sorted = <T>(xs: readonly T[]): T[] => [...xs].sort();

/** The SQL `from` as a status list: a sentence (mark_reject_justified) means any status. */
function jsonFrom(a: JsonAction): Status[] {
  return typeof a.from === 'string' ? [...STATUSES] : a.from;
}

describe('TRANSITIONS agree with supabase/tests/transitions.json', () => {
  it('master roles and active statuses', () => {
    expect(sorted(MASTER_ROLES)).toEqual(sorted(machine.master_roles));
    expect(sorted(ACTIVE_STATUSES)).toEqual(sorted(machine.active));
  });

  it('the same actions (create lives in create_order)', () => {
    expect(sorted(Object.keys(TRANSITIONS).filter((a) => a !== 'create'))).toEqual(
      sorted(Object.keys(machine.actions)),
    );
    expect(sorted(ORDER_ACTIONS)).toEqual(
      sorted(jsonActions.filter(([, a]) => a.actor !== 'system').map(([name]) => name)),
    );
  });

  it('every error code is a RotaError code', () => {
    for (const code of machine.errors) expect(ERROR_CODES).toContain(code);
  });

  for (const [name, a] of jsonActions) {
    it(`${name}: actor, from, to, via, requires, single_in_progress`, () => {
      const tr = TRANSITIONS[name];
      expect(tr, name).toBeDefined();
      expect(tr.actor).toBe(a.actor);
      expect(sorted(tr.from)).toEqual(sorted(jsonFrom(a)));
      if (typeof a.from === 'string') expect(tr.needs_reject_event).toBe(true);
      else expect(tr.needs_reject_event ?? false).toBe(false);
      expect(Array.isArray(tr.to) ? sorted(tr.to as Status[]) : tr.to).toEqual(
        Array.isArray(a.to) ? sorted(a.to) : a.to,
      );
      expect(tr.via).toBe(a.via);
      expect(sorted(tr.requires ?? [])).toEqual(sorted(a.requires ?? []));
      expect(tr.comment_required_when_reason).toBe(a.comment_required_when_reason);
      expect(tr.single_in_progress ?? false).toBe(a.single_in_progress ?? false);
    });
  }
});

// ---------------------------------------------------------------------------
// behaviour: every action × status × role
// ---------------------------------------------------------------------------

const NOW = new Date('2026-10-08T06:00:00.000Z');
const at = (min: number) => new Date(NOW.getTime() + min * 60_000).toISOString();

const ASSIGNEE = mockEmployeeId('2001');
const OTHER_WORKER = mockEmployeeId('2002');

/** One actor per role; the worker role appears twice: as the assignee and as somebody else. */
const ACTORS: { label: string; actor: Actor }[] = [
  { label: 'assignee', actor: { user_id: ASSIGNEE, role: 'worker' } },
  { label: 'other worker', actor: { user_id: OTHER_WORKER, role: 'worker' } },
  ...ROLES.filter((r) => r !== 'worker').map((role) => ({
    label: role,
    actor: { user_id: mockEmployeeId(role === 'master' ? '1001' : role === 'manager' ? '3001' : '9001'), role },
  })),
];

function orderIn(status: Status): Order {
  const finished = ['done', 'ai_review', 'rework', 'closed'].includes(status);
  return {
    id: 1,
    number: 101,
    client_ref: '11111111-1111-4111-8111-111111111111',
    type: 'unplanned',
    priority: 'high',
    description: 'Течь масла',
    comment: null,
    area_id: 3,
    equipment_id: 20,
    assignee_id: ASSIGNEE,
    brigade_id: null,
    master_id: mockEmployeeId('1001'),
    status,
    due_at: at(120),
    norm_hours: 1.5,
    equipment_stopped: false,
    suggested_fault_code: null,
    queue_position: status === 'queued' ? 1 : null,
    works_done: null,
    fault_code: null,
    closing_comment: null,
    created_at: at(-60),
    issued_at: at(-60),
    accepted_at: status === 'issued' ? null : at(-50),
    queued_at: null,
    rejected_at: null,
    started_at: finished || status === 'in_progress' || status === 'paused' ? at(-45) : null,
    done_at: finished ? at(-5) : null,
    closed_at: null,
    cancelled_at: null,
    paused_since: status === 'paused' ? at(-10) : null,
    paused_total_sec: 0,
    last_comment: null,
    rework_count: 0,
    ai_review_id: finished ? 900 : null,
    final_verdict: null,
    final_score: null,
    repeat_of_order_id: null,
    is_demo: false,
  };
}

const review: AiReview = {
  id: 900,
  order_id: 1,
  attempt: 1,
  verdict: 'rework',
  score: 40,
  score5: 2,
  confidence: 0.9,
  needs_master_review: false,
  checks: [],
  photo: null,
  feedback_worker: null,
  report_master: null,
  model: 'mock',
  latency_ms: 1,
  created_at: at(-1),
  master_verdict: null,
  master_score: null,
  master_comment: null,
  master_id: null,
  master_decided_at: null,
};

const rejectEvent: OrderEvent = {
  id: 501,
  order_id: 1,
  actor_id: ASSIGNEE,
  action: 'reject',
  from_status: 'issued',
  to_status: 'rejected',
  reason: 'no_permit',
  comment: null,
  payload: {},
  client_action_id: null,
  created_at: at(-30),
};

/** The payload a client sends for each action: every field of `requires` filled. */
function payloadFor(name: TransitionAction): SystemActionPayload {
  switch (name) {
    case 'reject':
      return { reason: 'no_permit' };
    case 'pause':
      return { reason: 'waiting_parts' };
    case 'return':
      return { comment: 'Нет фото после' };
    case 'cancel':
      return { reason: 'Ошибочный наряд' };
    case 'reassign':
      return { assignee_id: OTHER_WORKER };
    case 'set_priority':
      return { priority: 'emergency' };
    case 'mark_reject_justified':
      return { reject_event_id: 501 };
    case 'ai_result':
      return { review_id: 900 };
    default:
      return {};
  }
}

function attempt(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    if (e instanceof RotaError) return e.code;
    throw e;
  }
}

function mayAct(a: JsonAction, who: { label: string; actor: Actor }): boolean {
  if (a.actor === 'assignee') return who.label === 'assignee';
  if (a.actor === 'master') return (machine.master_roles as string[]).includes(who.actor.role);
  return false;
}

const employees = [
  { id: ASSIGNEE, role: 'worker' as const, on_shift: true, short_name: 'Ахметов Е.' },
  { id: OTHER_WORKER, role: 'worker' as const, on_shift: true, short_name: 'Иванов С.' },
];

describe('applyAction and allowedActions behave like transitions.json', () => {
  for (const [name, a] of jsonActions) {
    it(`${name} for every status and role`, () => {
      const from = jsonFrom(a);
      for (const status of STATUSES) {
        const order = orderIn(status);
        const base = { now: NOW, employees, reviews: [review], events: [rejectEvent] };

        // the system may only send ai_result
        const systemCode = attempt(() => applyAction(order, name as OrderAction, payloadFor(name), { ...base, actor: 'system' }));
        if (a.actor === 'system') {
          expect(systemCode, `${name} from ${status} as system`).toBe(from.includes(status) ? null : 'BAD_TRANSITION');
        } else {
          expect(systemCode, `${name} as system`).toBe('FORBIDDEN');
        }

        for (const who of ACTORS) {
          const code = attempt(() => applyAction(order, name as OrderAction, payloadFor(name), { ...base, actor: who.actor }));
          const label = `${name} from ${status} by ${who.label}`;
          if (!mayAct(a, who)) {
            expect(code, label).toBe('FORBIDDEN');
            continue;
          }
          expect(code, label).toBe(from.includes(status) ? null : 'BAD_TRANSITION');

          if (a.actor !== 'system') {
            const shown = allowedActions(order, who.actor, { events: [rejectEvent] }).includes(name as OrderAction);
            expect(shown, `allowedActions: ${label}`).toBe(from.includes(status));
          }
        }

        // a role that may not act never sees the button
        for (const who of ACTORS.filter((w) => !mayAct(a, w))) {
          expect(allowedActions(order, who.actor, { events: [rejectEvent] })).not.toContain(name);
        }
      }
    });

    if (a.from !== undefined && typeof a.from !== 'string' && a.to !== 'same') {
      it(`${name} reaches ${JSON.stringify(a.to)}`, () => {
        const targets = Array.isArray(a.to) ? a.to : [a.to];
        for (const status of a.from as Status[]) {
          const who = a.actor === 'assignee' ? { user_id: ASSIGNEE, role: 'worker' as const }
            : a.actor === 'master' ? { user_id: mockEmployeeId('1001'), role: 'master' as const }
            : 'system' as const;
          const r = applyAction(orderIn(status), name as OrderAction, payloadFor(name), {
            actor: who,
            now: NOW,
            employees,
            reviews: [review],
            events: [rejectEvent],
          });
          expect(targets).toContain(r.order.status);
          if (a.via) expect(r.events.map((e) => e.to_status)).toContain(a.via);
        }
      });
    }

    if (a.requires?.length) {
      it(`${name} raises MISSING_REASON without ${a.requires.join(', ')}`, () => {
        const status = jsonFrom(a)[0] as Status;
        const actor = a.actor === 'assignee'
          ? { user_id: ASSIGNEE, role: 'worker' as const }
          : { user_id: mockEmployeeId('1001'), role: 'master' as const };
        const code = attempt(() =>
          applyAction(orderIn(status), name as OrderAction, {}, { actor, now: NOW, employees, reviews: [review] }),
        );
        expect(code).toBe('MISSING_REASON');
        if (a.comment_required_when_reason) {
          const reasonOnly = attempt(() =>
            applyAction(orderIn(status), name as OrderAction, { reason: a.comment_required_when_reason }, { actor, now: NOW }),
          );
          expect(reasonOnly).toBe('MISSING_REASON');
          const withComment = attempt(() =>
            applyAction(
              orderIn(status),
              name as OrderAction,
              { reason: a.comment_required_when_reason, comment: 'Причина' },
              { actor, now: NOW },
            ),
          );
          expect(withComment).toBeNull();
        }
      });
    }

    if (a.single_in_progress) {
      it(`${name} keeps one order in progress per worker`, () => {
        const status = jsonFrom(a)[0] as Status;
        const running = { ...orderIn('in_progress'), id: 2, number: 102 };
        const actor = { user_id: ASSIGNEE, role: 'worker' as const };
        expect(attempt(() => applyAction(orderIn(status), name as OrderAction, {}, { actor, now: NOW, orders: [running] }))).toBe(
          'ANOTHER_IN_PROGRESS',
        );
        const r = applyAction(orderIn(status), name as OrderAction, { pause_current: true }, { actor, now: NOW, orders: [running] });
        expect(r.order.status).toBe('in_progress');
        expect(r.sideEffects.some((e) => e.type === 'update_order' && e.order.id === 2 && e.order.status === 'paused')).toBe(true);
      });
    }
  }

  it('actions without single_in_progress ignore another order in progress', () => {
    const running = { ...orderIn('in_progress'), id: 2, number: 102 };
    const actor = { user_id: ASSIGNEE, role: 'worker' as const };
    for (const [name, a] of jsonActions.filter(([, x]) => x.actor === 'assignee' && !x.single_in_progress)) {
      const status = jsonFrom(a)[0] as Status;
      expect(
        attempt(() => applyAction(orderIn(status), name as OrderAction, payloadFor(name), { actor, now: NOW, orders: [running] })),
        name,
      ).toBeNull();
    }
  });
});
