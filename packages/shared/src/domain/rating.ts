// The worker and brigade rating (CLAUDE.md §13), mirrored from public.rating() in
// supabase/migrations/20261008100009_rota_reports.sql for MockApi and the UI. Pure: the caller passes the
// orders, events and people, and gets the same RatingRow[] the RPC returns.
//   Q quality      mean(final_score) / 100
//   T on time      share with done_at ≤ due_at
//   F first fix    1 − share reworked or followed by the same fault on the same unit within 7 days
//                  (unit and code pairs with 5+ unplanned orders are chronic and not counted against the worker)
//   V volume       Σ norm_hours × k(priority) / max over workers
//   D discipline   1 − unjustified rejects / orders ever assigned (from events, because reassign rewrites the assignee)
// Q, T and F are shrunk toward the team: x_adj = (n·x + 5·team_x) / (n + 5).
// score = 100 × (0.35·Q + 0.25·T + 0.20·F + 0.10·V + 0.10·D); brigade = closed-weighted mean of its members.

import type { Priority, Role } from './enums';
import type { Brigade, Employee, Order, OrderEvent, Period, RatingRow, ReportFilters } from './types';
import { pgRound } from './verifyRules';

export const RATING_WEIGHTS = { q: 0.35, t: 0.25, f: 0.2, v: 0.1, d: 0.1 } as const;
export type RatingComponent = keyof typeof RATING_WEIGHTS;
export const RATING_COMPONENTS: readonly RatingComponent[] = ['q', 't', 'f', 'v', 'd'];

/** Pseudo count of the Bayesian shrinkage toward the team value. */
export const RATING_PRIOR = 5;

/** Complexity factor of V by priority. */
export const VOLUME_K: Readonly<Record<Priority, number>> = { emergency: 1.3, high: 1.15, normal: 1.0, planned: 0.9 };

/** Days after done_at in which the same fault on the same unit counts as a repeat failure. */
export const REPEAT_WINDOW_DAYS = 7;
/** A unit and code pair with this many unplanned orders is a chronic equipment fault. */
export const CHRONIC_MIN_ORDERS = 5;

export const RATING_NO_CLOSED_NOTE = 'нет закрытых нарядов';

/** (n·x + 5·team) / (n + 5); null for n = 0 or a missing value. */
export function shrink(n: number, x: number | null, team: number | null): number | null {
  if (n <= 0 || x == null || team == null) return null;
  return (n * x + RATING_PRIOR * team) / (n + RATING_PRIOR);
}

/** Points each component adds to the score (100 × weight × value), for «Из чего сложился рейтинг» and the stacked bars. */
export function ratingContributions(row: Pick<RatingRow, RatingComponent>): Record<RatingComponent, number> {
  const out = {} as Record<RatingComponent, number>;
  for (const k of RATING_COMPONENTS) out[k] = pgRound(100 * RATING_WEIGHTS[k] * (row[k] ?? 0), 1);
  return out;
}

/** Order fields the rating reads. Pass every order you have (any status): closed ones are rated, unplanned ones
 *  also feed the repeat failures and the chronic pairs. */
export type RatingOrder = Pick<
  Order,
  | 'id'
  | 'type'
  | 'status'
  | 'priority'
  | 'assignee_id'
  | 'area_id'
  | 'equipment_id'
  | 'fault_code'
  | 'final_score'
  | 'norm_hours'
  | 'rework_count'
  | 'created_at'
  | 'done_at'
  | 'due_at'
  | 'closed_at'
>;

/** Event fields the rating reads (create, reassign, reject and mark_reject_justified matter). */
export type RatingEvent = Pick<OrderEvent, 'id' | 'order_id' | 'actor_id' | 'action' | 'reason' | 'payload' | 'created_at'>;

export interface RatingInput {
  period: Period;
  filters?: ReportFilters;
  /** Employees; only role = worker are rated. */
  employees: readonly Pick<Employee, 'id' | 'short_name' | 'brigade_id' | 'role'>[];
  brigades: readonly Pick<Brigade, 'id' | 'name'>[];
  orders: readonly RatingOrder[];
  events: readonly RatingEvent[];
  /** A worker viewer sees only their own row; staff (or no viewer) see everyone. */
  viewer?: { id: string; role: Role } | null;
}

const DAY_MS = 86_400_000;
const ms = (ts: string): number => Date.parse(ts);

function mean(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
}

/** Same unit, same code, unplanned, created within 7 days after done_at (internal.repeat_after). */
function repeatAfter(o: RatingOrder, unplanned: readonly RatingOrder[]): boolean {
  if (o.type !== 'unplanned' || o.done_at == null || o.fault_code == null) return false;
  const done = ms(o.done_at);
  return unplanned.some(
    (r) =>
      r.equipment_id === o.equipment_id &&
      r.fault_code === o.fault_code &&
      ms(r.created_at) > done &&
      ms(r.created_at) <= done + REPEAT_WINDOW_DAYS * DAY_MS,
  );
}

/** internal.chronic_pairs: «equipment_id|fault_code» keys with 5+ unplanned orders created in [from − 7 d, to). */
export function chronicPairs(orders: readonly RatingOrder[], period: Period): Set<string> {
  const from = ms(period.from) - REPEAT_WINDOW_DAYS * DAY_MS;
  const to = ms(period.to);
  const counts = new Map<string, number>();
  for (const o of orders) {
    if (o.type !== 'unplanned' || o.fault_code == null) continue;
    const at = ms(o.created_at);
    if (at < from || at >= to) continue;
    const key = `${o.equipment_id}|${o.fault_code}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, n]) => n >= CHRONIC_MIN_ORDERS).map(([key]) => key));
}

interface Scored {
  id: string;
  name: string;
  brigade_id: number | null;
  n: number;
  q: number | null;
  t: number | null;
  f: number | null;
  v: number | null;
  d: number;
}

const r3 = (x: number | null): number | null => (x == null ? null : pgRound(x, 3));

/** public.rating(from, to, filters): worker rows then brigade rows, each ranked by score. */
export function computeRating(input: RatingInput): RatingRow[] {
  const { period } = input;
  const filters = input.filters ?? {};
  const from = ms(period.from);
  const to = ms(period.to);
  const inPeriod = (ts: string): boolean => ms(ts) >= from && ms(ts) < to;

  const chronic = chronicPairs(input.orders, period);
  const unplanned = input.orders.filter((o) => o.type === 'unplanned');
  const closed = input.orders.filter(
    (o) =>
      o.status === 'closed' &&
      o.closed_at != null &&
      inPeriod(o.closed_at) &&
      (filters.area_id == null || o.area_id === filters.area_id) &&
      (filters.equipment_id == null || o.equipment_id === filters.equipment_id),
  );
  const perOrder = closed.map((c) => ({
    assignee_id: c.assignee_id,
    final_score: c.final_score,
    on_time: c.done_at == null ? null : ms(c.done_at) <= ms(c.due_at),
    not_first_fix:
      c.rework_count > 0 || (repeatAfter(c, unplanned) && !chronic.has(`${c.equipment_id}|${c.fault_code ?? ''}`)),
    volume: (c.norm_hours ?? 1) * VOLUME_K[c.priority],
  }));

  const qOf = (rows: typeof perOrder): number | null => {
    const m = mean(rows.flatMap((p) => (p.final_score == null ? [] : [p.final_score])));
    return m == null ? null : m / 100;
  };
  const tOf = (rows: typeof perOrder): number | null =>
    mean(rows.flatMap((p) => (p.on_time == null ? [] : [p.on_time ? 1 : 0])));
  const fOf = (rows: typeof perOrder): number | null => {
    const m = mean(rows.map((p) => (p.not_first_fix ? 1 : 0)));
    return m == null ? null : 1 - m;
  };
  const team = { q: qOf(perOrder), t: tOf(perOrder), f: fOf(perOrder) };

  // orders ever assigned, from events: create (payload.assignee_id) and reassign (payload.to_assignee_id)
  const assigned = new Map<string, Set<number>>();
  const justified = new Set(
    input.events
      .filter((e) => e.action === 'mark_reject_justified')
      .map((e) => Number((e.payload as { reject_event_id?: unknown }).reject_event_id)),
  );
  const unjust = new Map<string, number>();
  for (const e of input.events) {
    if (!inPeriod(e.created_at)) continue;
    const payload = e.payload as { assignee_id?: unknown; to_assignee_id?: unknown };
    const worker =
      e.action === 'create' ? payload.assignee_id : e.action === 'reassign' ? payload.to_assignee_id : undefined;
    if (typeof worker === 'string') {
      const set = assigned.get(worker) ?? new Set<number>();
      set.add(e.order_id);
      assigned.set(worker, set);
    }
    if (e.action === 'reject' && e.actor_id != null && e.reason === 'other' && !justified.has(e.id)) {
      unjust.set(e.actor_id, (unjust.get(e.actor_id) ?? 0) + 1);
    }
  }

  const workers = input.employees.filter((e) => e.role === 'worker');
  const agg = workers.map((w) => {
    const mine = perOrder.filter((p) => p.assignee_id === w.id);
    return {
      w,
      n: mine.length,
      q: qOf(mine),
      t: tOf(mine),
      f: fOf(mine),
      vol: mine.reduce((sum, p) => sum + p.volume, 0),
    };
  });
  const maxVol = agg.reduce((m, a) => Math.max(m, a.vol), 0);

  const scored: Scored[] = agg.map((a) => {
    const asg = assigned.get(a.w.id)?.size ?? 0;
    return {
      id: a.w.id,
      name: a.w.short_name,
      brigade_id: a.w.brigade_id,
      n: a.n,
      q: shrink(a.n, a.q, team.q),
      t: shrink(a.n, a.t, team.t),
      f: shrink(a.n, a.f, team.f),
      v: maxVol > 0 ? a.vol / maxVol : null,
      d: asg > 0 ? 1 - (unjust.get(a.w.id) ?? 0) / asg : 1,
    };
  });

  type Row = Omit<RatingRow, 'rank' | 'note'>;
  const workerRows: Row[] = scored.map((s) => ({
    kind: 'worker',
    id: s.id,
    name: s.name,
    brigade_id: s.brigade_id,
    closed: s.n,
    q: r3(s.q),
    t: r3(s.t),
    f: r3(s.f),
    v: r3(s.v ?? 0),
    d: r3(s.d),
    score:
      s.n > 0 && s.q != null && s.t != null && s.f != null
        ? pgRound(
            100 *
              (RATING_WEIGHTS.q * s.q +
                RATING_WEIGHTS.t * s.t +
                RATING_WEIGHTS.f * s.f +
                RATING_WEIGHTS.v * (s.v ?? 0) +
                RATING_WEIGHTS.d * s.d),
            1,
          )
        : null,
  }));

  // brigades: closed-weighted means of the rounded member rows that have a score
  const brigadeRows: Row[] = [];
  for (const b of input.brigades) {
    const members = workerRows.filter((w) => w.brigade_id === b.id && w.score != null);
    if (members.length === 0) continue;
    const total = members.reduce((sum, w) => sum + w.closed, 0);
    const wavg = (pick: (w: Row) => number | null, digits: number): number | null =>
      total === 0 ? null : pgRound(members.reduce((sum, w) => sum + (pick(w) ?? 0) * w.closed, 0) / total, digits);
    brigadeRows.push({
      kind: 'brigade',
      id: String(b.id),
      name: b.name,
      brigade_id: b.id,
      closed: total,
      q: wavg((w) => w.q, 3),
      t: wavg((w) => w.t, 3),
      f: wavg((w) => w.f, 3),
      v: wavg((w) => w.v, 3),
      d: wavg((w) => w.d, 3),
      score: wavg((w) => w.score, 1),
    });
  }

  const viewer = input.viewer;
  const visible = [...workerRows, ...brigadeRows].filter(
    (x) =>
      (filters.brigade_id == null || x.brigade_id === filters.brigade_id) &&
      (filters.assignee_id == null || (x.kind === 'worker' && x.id === filters.assignee_id)) &&
      (viewer == null || viewer.role !== 'worker' || (x.kind === 'worker' && x.id === viewer.id)),
  );

  // rank() over (partition by kind order by score desc nulls last)
  const rankOf = (row: Row): number =>
    1 +
    visible.filter(
      (o) => o.kind === row.kind && o.score != null && (row.score == null || o.score > row.score),
    ).length;

  const byScore = (a: Row, b: Row): number => {
    if (a.kind !== b.kind) return a.kind === 'worker' ? -1 : 1;
    if (a.score !== b.score) {
      if (a.score == null) return 1;
      if (b.score == null) return -1;
      return b.score - a.score;
    }
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  };

  return visible
    .map((row) => ({ ...row, rank: rankOf(row), note: row.closed === 0 ? RATING_NO_CLOSED_NOTE : null }))
    .sort(byScore);
}
