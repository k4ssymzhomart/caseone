// boardColumn (v_orders.board_column) and deriveWorkerStatus (v_worker_status), CLAUDE.md §6 and §7.

import { describe, expect, it } from 'vitest';
import { brigades, employees, equipment, mockEmployeeId } from '../fixtures';
import { ACTIVE_STATUSES, STATUSES, type Status } from './enums';
import { boardColumn, isOverdue, workerStateText } from './status';
import { deriveBrigadeStatuses, deriveWorkerStatus, deriveWorkerStatuses } from './workerStatus';
import type { Employee, Order } from './types';

const NOW = new Date('2026-10-08T06:00:00.000Z');
const FUTURE = '2026-10-08T08:00:00.000Z';
const PAST = '2026-10-08T05:00:00.000Z';

describe('boardColumn', () => {
  const col = (status: Status, due = FUTURE) => boardColumn({ status, due_at: due }, NOW);

  it('rejected goes to «Выданы» with issued', () => {
    expect(col('issued')).toBe('issued');
    expect(col('rejected')).toBe('issued');
  });

  it('paused and rework go to «В работе» with in_progress', () => {
    expect(col('in_progress')).toBe('in_progress');
    expect(col('paused')).toBe('in_progress');
    expect(col('rework')).toBe('in_progress');
  });

  it('accepted and queued have their own columns', () => {
    expect(col('accepted')).toBe('accepted');
    expect(col('queued')).toBe('queued');
  });

  it('done, ai_review and closed go to «Выполнены»; cancelled has none', () => {
    expect(col('done')).toBe('done');
    expect(col('ai_review')).toBe('done');
    expect(col('closed')).toBe('done');
    expect(col('cancelled')).toBeNull();
  });

  it('every overdue active order goes to «Просрочены»', () => {
    for (const s of ACTIVE_STATUSES) {
      expect(col(s, PAST), s).toBe('overdue');
      expect(isOverdue({ status: s, due_at: PAST }, NOW)).toBe(true);
    }
  });

  it('finished and rejected orders past due stay where they are', () => {
    for (const s of STATUSES.filter((x) => !(ACTIVE_STATUSES as readonly Status[]).includes(x))) {
      expect(col(s, PAST), s).toBe(col(s, FUTURE));
    }
  });

  it('the deadline itself is not overdue yet (now > due_at)', () => {
    expect(col('issued', NOW.toISOString())).toBe('issued');
  });
});

// ---------------------------------------------------------------------------

const W1 = mockEmployeeId('2001');
const W2 = mockEmployeeId('2002');
const W3 = mockEmployeeId('2003');
const W4 = mockEmployeeId('2004');

const ON_SHIFT = new Set([W1, W2, W3]);
const staff: Employee[] = employees.map((e) => ({ ...e, on_shift: ON_SHIFT.has(e.id) }));
const emp = (id: string): Employee => {
  const e = staff.find((x) => x.id === id);
  if (!e) throw new Error(id);
  return e;
};

let seq = 0;
function order(assignee: string, status: Status, overrides: Partial<Order> = {}) {
  seq += 1;
  return {
    id: seq,
    number: 100 + seq,
    assignee_id: assignee,
    status,
    started_at: status === 'in_progress' ? PAST : null,
    equipment_id: 13,
    ...overrides,
  };
}

describe('deriveWorkerStatus', () => {
  it('free: on shift, nothing open', () => {
    const w = deriveWorkerStatus(emp(W1), [order(W1, 'closed'), order(W1, 'cancelled'), order(W1, 'rejected')]);
    expect(w).toMatchObject({
      id: W1,
      tab_no: '2001',
      short_name: 'Ахметов Е.',
      on_shift: true,
      status: 'free',
      current_order_id: null,
      current_order_number: null,
      current_equipment_name: null,
      queue_count: 0,
    });
    expect(workerStateText(w)).toBe('Свободен');
  });

  it('working: the latest started order in progress, with its equipment', () => {
    const older = order(W2, 'in_progress', { started_at: '2026-10-08T03:00:00.000Z', equipment_id: 11 });
    const newer = order(W2, 'in_progress', { started_at: '2026-10-08T04:00:00.000Z', number: 147, equipment_id: 12 });
    const w = deriveWorkerStatus(emp(W2), [older, newer, order(W2, 'queued')], equipment);
    expect(w).toMatchObject({
      status: 'working',
      current_order_id: newer.id,
      current_order_number: 147,
      current_equipment_name: 'Конвейер К-2',
      queue_count: 1,
    });
    expect(workerStateText(w)).toBe('Выполняет наряд №147');
  });

  it('working beats queue; started_at null sorts last', () => {
    const noStart = order(W2, 'in_progress', { started_at: null });
    const started = order(W2, 'in_progress');
    expect(deriveWorkerStatus(emp(W2), [noStart, started]).current_order_id).toBe(started.id);
  });

  it('queue: issued, accepted, queued, paused and rework count', () => {
    const open = (['issued', 'accepted', 'queued', 'paused', 'rework'] as const).map((s) => order(W3, s));
    const done = (['done', 'ai_review', 'closed', 'cancelled', 'rejected'] as const).map((s) => order(W3, s));
    const w = deriveWorkerStatus(emp(W3), [...open, ...done, order(W1, 'queued')]);
    expect(w).toMatchObject({ status: 'queue', queue_count: 5 });
    expect(workerStateText(w)).toBe('В очереди 5');
  });

  it('off: not on shift, whatever is assigned', () => {
    const w = deriveWorkerStatus(emp(W4), [order(W4, 'in_progress'), order(W4, 'queued')]);
    expect(w).toMatchObject({ status: 'off', on_shift: false, queue_count: 1 });
    expect(w.current_order_id).not.toBeNull();
    expect(workerStateText(w)).toBe('Не на смене');
  });

  it('deriveWorkerStatuses lists workers only', () => {
    const rows = deriveWorkerStatuses(staff, []);
    expect(rows).toHaveLength(15);
    expect(rows.every((r) => r.tab_no.startsWith('20'))).toBe(true);
  });

  it('deriveBrigadeStatuses counts on shift, free and busy members', () => {
    const workers = deriveWorkerStatuses(staff, [order(W2, 'in_progress'), order(W3, 'queued')]);
    const [b1] = deriveBrigadeStatuses(brigades, staff, workers);
    expect(b1).toMatchObject({
      id: 1,
      leader_id: W1,
      leader_short_name: 'Ахметов Е.',
      on_shift_count: 3,
      free_count: 1,
      busy_count: 2,
    });
  });
});
