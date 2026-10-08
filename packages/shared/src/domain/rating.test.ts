import { describe, expect, it } from 'vitest';
import type { RatingRow } from './types';
import {
  chronicPairs,
  computeRating,
  ratingContributions,
  shrink,
  type RatingEvent,
  type RatingInput,
  type RatingOrder,
} from './rating';

const PERIOD = { from: '2026-09-01T00:00:00Z', to: '2026-10-01T00:00:00Z' };
const W1 = 'w1';
const W2 = 'w2';
const W3 = 'w3';
const W4 = 'w4';

const employees: RatingInput['employees'] = [
  { id: W1, short_name: 'Ахметов Е.', brigade_id: 1, role: 'worker' },
  { id: W2, short_name: 'Иванов С.', brigade_id: 1, role: 'worker' },
  { id: W3, short_name: 'Сериков Д.', brigade_id: 2, role: 'worker' },
  { id: W4, short_name: 'Абенов Т.', brigade_id: 2, role: 'worker' },
  { id: 'm1', short_name: 'Жумабаев Н.', brigade_id: null, role: 'master' },
];
const brigades = [
  { id: 1, name: 'Бригада 1' },
  { id: 2, name: 'Бригада 2' },
];

function order(over: Partial<RatingOrder> & Pick<RatingOrder, 'id' | 'assignee_id'>): RatingOrder {
  return {
    type: 'unplanned',
    status: 'closed',
    priority: 'normal',
    area_id: 1,
    equipment_id: 1,
    fault_code: 'М-02',
    final_score: 80,
    norm_hours: 1,
    rework_count: 0,
    created_at: '2026-09-05T03:00:00Z',
    done_at: '2026-09-05T05:00:00Z',
    due_at: '2026-09-05T07:00:00Z',
    closed_at: '2026-09-05T06:00:00Z',
    ...over,
  };
}

let eventId = 0;
function event(over: Partial<RatingEvent> & Pick<RatingEvent, 'order_id' | 'action'>): RatingEvent {
  eventId += 1;
  return {
    id: eventId,
    actor_id: null,
    reason: null,
    payload: {},
    created_at: '2026-09-05T03:00:00Z',
    ...over,
  };
}

// W1: two on time orders (high 2 h, planned 1 h), one unjustified «other» refusal out of 3 assigned
// W2: one late emergency order (3 h) that went to rework
// W3: one order followed by the same fault on the same unit within 7 days; a justified refusal
// W4: nothing closed
const orders: RatingOrder[] = [
  order({ id: 1, assignee_id: W1, priority: 'high', norm_hours: 2, final_score: 90, equipment_id: 1 }),
  order({ id: 2, assignee_id: W1, type: 'planned', priority: 'planned', norm_hours: 1, final_score: 80, fault_code: 'С-01' }),
  order({
    id: 3,
    assignee_id: W2,
    priority: 'emergency',
    norm_hours: 3,
    final_score: 70,
    rework_count: 1,
    equipment_id: 2,
    fault_code: 'Г-01',
    done_at: '2026-09-05T08:00:00Z',
    closed_at: '2026-09-05T09:00:00Z',
  }),
  order({
    id: 4,
    assignee_id: W3,
    final_score: 100,
    equipment_id: 3,
    fault_code: 'Э-01',
    done_at: '2026-09-10T05:00:00Z',
    due_at: '2026-09-10T07:00:00Z',
    closed_at: '2026-09-10T06:00:00Z',
  }),
  // the repeat failure after order 4 (any status counts)
  order({ id: 5, assignee_id: W2, status: 'cancelled', equipment_id: 3, fault_code: 'Э-01', created_at: '2026-09-12T05:00:00Z', closed_at: null }),
  // refused by W1, reassigned to W3, then cancelled
  order({ id: 6, assignee_id: W3, status: 'cancelled', fault_code: null, closed_at: null }),
];
const reject1 = event({ order_id: 6, action: 'reject', actor_id: W1, reason: 'other' });
const reject2 = event({ order_id: 3, action: 'reject', actor_id: W2, reason: 'no_permit' });
const reject3 = event({ order_id: 4, action: 'reject', actor_id: W3, reason: 'other' });
const events: RatingEvent[] = [
  event({ order_id: 1, action: 'create', payload: { assignee_id: W1 } }),
  event({ order_id: 2, action: 'create', payload: { assignee_id: W1 } }),
  event({ order_id: 3, action: 'create', payload: { assignee_id: W2 } }),
  event({ order_id: 4, action: 'create', payload: { assignee_id: W3 } }),
  event({ order_id: 6, action: 'create', payload: { assignee_id: W1 } }),
  reject1,
  event({ order_id: 6, action: 'reassign', payload: { to_assignee_id: W3 } }),
  reject2,
  reject3,
  event({ order_id: 4, action: 'mark_reject_justified', payload: { reject_event_id: reject3.id } }),
];

const base: RatingInput = { period: PERIOD, employees, brigades, orders, events };
const find = (rows: RatingRow[], kind: RatingRow['kind'], id: string): RatingRow | undefined =>
  rows.find((r) => r.kind === kind && r.id === id);

describe('computeRating', () => {
  const rows = computeRating(base);

  it('scores workers with shrinkage toward the team (team Q 0.85, T 0.75, F 0.5)', () => {
    // W1: Q (2·0.85 + 5·0.85)/7, T (2·1 + 5·0.75)/7, F (2·1 + 5·0.5)/7, V 3.2/3.9, D 1 − 1/3
    expect(find(rows, 'worker', W1)).toEqual({
      kind: 'worker',
      id: W1,
      name: 'Ахметов Е.',
      brigade_id: 1,
      closed: 2,
      q: 0.85,
      t: 0.821,
      f: 0.643,
      v: 0.821,
      d: 0.667,
      score: 78,
      rank: 1,
      note: null,
    });
    // W2: rework counts against F; D stays 1 (no_permit is not «other»)
    expect(find(rows, 'worker', W2)).toMatchObject({ q: 0.825, t: 0.625, f: 0.417, v: 1, d: 1, score: 72.8, rank: 2 });
    // W3: the repeat failure counts against F; the justified refusal does not count against D
    expect(find(rows, 'worker', W3)).toMatchObject({ q: 0.875, t: 0.792, f: 0.417, v: 0.256, d: 1, score: 71.3, rank: 3 });
  });

  it('lists a worker without closed orders with no score, last', () => {
    expect(find(rows, 'worker', W4)).toMatchObject({
      closed: 0,
      q: null,
      t: null,
      f: null,
      v: 0,
      d: 1,
      score: null,
      rank: 4,
      note: 'нет закрытых нарядов',
    });
    expect(rows.some((r) => r.id === 'm1')).toBe(false);
  });

  it('brigades are the closed weighted mean of members with a score', () => {
    expect(find(rows, 'brigade', '1')).toMatchObject({ name: 'Бригада 1', closed: 3, q: 0.842, score: 76.3, rank: 1 });
    expect(find(rows, 'brigade', '2')).toMatchObject({ closed: 1, score: 71.3, rank: 2 });
  });

  it('orders workers first, then brigades, each by score', () => {
    expect(rows.map((r) => `${r.kind}:${r.id}`)).toEqual([
      'worker:w1',
      'worker:w2',
      'worker:w3',
      'worker:w4',
      'brigade:1',
      'brigade:2',
    ]);
  });

  it('applies the shared filter and the viewer', () => {
    const b2 = computeRating({ ...base, filters: { brigade_id: 2 } });
    expect(b2.map((r) => `${r.kind}:${r.id}:${r.rank}`)).toEqual(['worker:w3:1', 'worker:w4:2', 'brigade:2:1']);

    const one = computeRating({ ...base, filters: { assignee_id: W2 } });
    expect(one.map((r) => r.id)).toEqual([W2]);

    const own = computeRating({ ...base, viewer: { id: W3, role: 'worker' } });
    expect(own.map((r) => r.id)).toEqual([W3]);

    const staff = computeRating({ ...base, viewer: { id: 'm1', role: 'master' } });
    expect(staff).toHaveLength(rows.length);

    // area and equipment filter the closed orders (and the team) before scoring
    const unit2 = computeRating({ ...base, filters: { equipment_id: 2 } });
    expect(find(unit2, 'worker', W2)).toMatchObject({ closed: 1, q: 0.7, t: 0, f: 0 });
    expect(find(unit2, 'worker', W1)?.score).toBeNull();
  });

  it('does not count chronic unit and code pairs against first time fix', () => {
    const chronic: RatingOrder[] = [
      order({
        id: 10,
        assignee_id: W1,
        equipment_id: 9,
        fault_code: 'М-02',
        created_at: '2026-09-03T03:00:00Z',
        done_at: '2026-09-03T05:00:00Z',
        closed_at: '2026-09-03T06:00:00Z',
      }),
      ...[11, 12, 13, 14].map((id, i) =>
        order({
          id,
          assignee_id: W2,
          status: 'issued',
          equipment_id: 9,
          fault_code: 'М-02',
          created_at: `2026-09-0${4 + i}T05:00:00Z`,
          closed_at: null,
        }),
      ),
    ];
    expect([...chronicPairs(chronic, PERIOD)]).toEqual(['9|М-02']);
    const out = computeRating({ ...base, orders: chronic, events: [] });
    expect(find(out, 'worker', W1)).toMatchObject({ closed: 1, f: 1 });

    // with only four orders on the pair it is a repeat failure again
    const fewer = computeRating({ ...base, orders: chronic.slice(0, 4), events: [] });
    expect(find(fewer, 'worker', W1)).toMatchObject({ closed: 1, f: 0 });
  });

  it('a worker with 2 orders cannot top the table on luck', () => {
    expect(shrink(2, 1, 0.5)).toBeCloseTo(4.5 / 7);
    expect(shrink(0, 1, 0.5)).toBeNull();
    expect(ratingContributions({ q: 0.85, t: 0.821, f: 0.643, v: 0.821, d: 0.667 })).toEqual({
      q: 29.8,
      t: 20.5,
      f: 12.9,
      v: 8.2,
      d: 6.7,
    });
  });
});
