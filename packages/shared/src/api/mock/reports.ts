// Reports over the mock store: public.shift_report and public.dashboard (20261008100009_rota_reports.sql) ported
// closely, the shift counters and equipment history of PHASE_2 §2.2, and the analytics cards (a small
// public.insight_cards over the store, same card kinds and wording; mock quality, the store holds a week).

import { ACTIVE_STATUSES, type Status } from '../../domain/enums';
import { computeRating } from '../../domain/rating';
import { pgRound, percentileCont, ruNumeric } from '../../domain/verifyRules';
import type {
  Dashboard,
  EquipmentHistory,
  Insight,
  InsightScope,
  InsightsInput,
  Order,
  Period,
  ReportFilters,
  Session,
  ShiftCounters,
  ShiftReport,
  ShiftReportInput,
} from '../../domain/types';
import { plural } from '../../format/number';
import { startOfLocalDay } from '../../format/time';
import { RotaError } from '../errors';
import type { MockDb } from './store';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const ms = (ts: string | null | undefined): number | null => (ts == null ? null : Date.parse(ts));
const isActive = (s: Status): boolean => (ACTIVE_STATUSES as readonly Status[]).includes(s);

function avg(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
}

/** The shared report filter on orders: участок, оборудование, исполнитель, бригада (order or assignee brigade). */
export function filterOrders(
  db: MockDb,
  orders: readonly Order[],
  filters: ReportFilters = {},
): Order[] {
  return orders.filter((o) => {
    if (filters.area_id != null && o.area_id !== filters.area_id) return false;
    if (filters.equipment_id != null && o.equipment_id !== filters.equipment_id) return false;
    if (filters.assignee_id != null && o.assignee_id !== filters.assignee_id) return false;
    if (filters.brigade_id != null) {
      const b = o.brigade_id ?? db.employee(o.assignee_id)?.brigade_id ?? null;
      if (b !== filters.brigade_id) return false;
    }
    return true;
  });
}

export function requireStaffRole(session: Session): void {
  if (session.role === 'worker')
    throw new RotaError('FORBIDDEN', { details: 'master, manager or admin only' });
}

// ---------------------------------------------------------------------------
// shift_report
// ---------------------------------------------------------------------------

export function shiftReport(db: MockDb, now: Date, input: ShiftReportInput): ShiftReport {
  const from = Date.parse(input.from);
  const to = Date.parse(input.to);
  const nowMs = now.getTime();
  const inRange = (ts: string | null): boolean => {
    const t = ms(ts);
    return t != null && t >= from && t < to;
  };
  const o = filterOrders(db, db.state.orders, input.filters);
  const ids = new Set(o.map((x) => x.id));
  const ev = db.state.events.filter((e) => ids.has(e.order_id) && inRange(e.created_at));
  const spanMin = Math.max((Math.min(to, nowMs) - from) / MIN, 1);
  const end = (x: Order): number => ms(x.done_at) ?? ms(x.cancelled_at) ?? nowMs;

  // workload: busy minutes in the window, pauses taken out proportionally
  const busy = new Map<string, { name: string; minutes: number }>();
  for (const x of o) {
    const started = ms(x.started_at);
    if (started == null || started >= to || end(x) <= from) continue;
    const span = Math.max(0, (Math.min(end(x), to) - Math.max(started, from)) / MIN);
    const total = Math.max((end(x) - started) / 1000, 1);
    const minutes = span * (1 - Math.min(1, x.paused_total_sec / total));
    const row = busy.get(x.assignee_id) ?? {
      name: db.employee(x.assignee_id)?.short_name ?? '',
      minutes: 0,
    };
    row.minutes += minutes;
    busy.set(x.assignee_id, row);
  }
  const shiftMin = spanMin > 720 ? spanMin / 2 : spanMin;

  // downtime of stopped units
  const down = new Map<number, { name: string; hours: number; orders: number }>();
  for (const x of o) {
    if (!x.equipment_stopped || Date.parse(x.created_at) >= to || end(x) <= from) continue;
    const hours = (Math.min(end(x), to) - Math.max(Date.parse(x.created_at), from)) / HOUR;
    const row = down.get(x.equipment_id) ?? {
      name: db.equipmentRow(x.equipment_id)?.name ?? '',
      hours: 0,
      orders: 0,
    };
    row.hours += hours;
    row.orders += 1;
    down.set(x.equipment_id, row);
  }
  const downRows = [...down.entries()].sort((a, b) => b[1].hours - a[1].hours);

  const distinctOrders = (action: string): number =>
    new Set(ev.filter((e) => e.action === action).map((e) => e.order_id)).size;
  const countEv = (pred: (e: (typeof ev)[number]) => boolean): number => ev.filter(pred).length;

  const reasons = new Map<string | null, number>();
  for (const e of ev)
    if (e.action === 'reject') reasons.set(e.reason, (reasons.get(e.reason) ?? 0) + 1);

  const verdicts: Record<string, number> = {};
  for (const e of ev) {
    const v = e.payload.verdict;
    if (e.action === 'ai_result' && typeof v === 'string') verdicts[v] = (verdicts[v] ?? 0) + 1;
  }

  const unplannedInRange = o.filter((x) => x.type === 'unplanned' && inRange(x.created_at));
  const issues = new Map<string, number>();
  for (const x of unplannedInRange)
    if (x.fault_code != null) issues.set(x.fault_code, (issues.get(x.fault_code) ?? 0) + 1);
  const units = new Map<number, number>();
  for (const x of unplannedInRange) units.set(x.equipment_id, (units.get(x.equipment_id) ?? 0) + 1);

  const doneInRange = o.filter((x) => inRange(x.done_at));
  const acceptedInRange = o.filter((x) => inRange(x.accepted_at));

  const reaction = avg(
    acceptedInRange.map((x) => ((ms(x.accepted_at) ?? 0) - Date.parse(x.issued_at)) / MIN),
  );
  const execution = avg(
    doneInRange
      .filter((x) => x.started_at != null)
      .map((x) => ((ms(x.done_at) ?? 0) - (ms(x.started_at) ?? 0)) / MIN - x.paused_total_sec / 60),
  );
  const onTime = avg(
    doneInRange.map((x) => ((ms(x.done_at) ?? 0) <= Date.parse(x.due_at) ? 1 : 0)),
  );

  return {
    period: { from: input.from, to: input.to },
    counts: {
      issued: o.filter((x) => inRange(x.created_at)).length,
      accepted: distinctOrders('accept'),
      done: distinctOrders('complete'),
      closed: o.filter((x) => inRange(x.closed_at)).length,
      overdue: o.filter(
        (x) =>
          (inRange(x.done_at) && (ms(x.done_at) ?? 0) > Date.parse(x.due_at)) ||
          (isActive(x.status) &&
            Date.parse(x.due_at) < Math.min(to, nowMs) &&
            Date.parse(x.created_at) < to),
      ).length,
      rejected: countEv((e) => e.action === 'reject'),
      rework: countEv(
        (e) => (e.action === 'ai_result' && e.to_status === 'rework') || e.action === 'return',
      ),
      cancelled: countEv((e) => e.action === 'cancel'),
      active_now: o.filter((x) => isActive(x.status)).length,
    },
    rejected_reasons: [...reasons.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([reason, count]) => ({ reason, count })),
    workload: [...busy.entries()]
      .sort((a, b) => b[1].minutes - a[1].minutes)
      .map(([employee_id, b]) => ({
        employee_id,
        short_name: b.name,
        busy_min: pgRound(b.minutes),
        share: pgRound(b.minutes / shiftMin, 2),
      })),
    downtime: downRows.slice(0, 10).map(([equipment_id, d]) => ({
      equipment_id,
      name: d.name,
      hours: pgRound(d.hours, 1),
      orders: d.orders,
    })),
    downtime_hours: pgRound(
      downRows.reduce((sum, [, d]) => sum + d.hours, 0),
      1,
    ),
    reaction_avg_min: reaction == null ? null : pgRound(reaction, 1),
    execution_avg_min: execution == null ? null : pgRound(execution, 1),
    on_time_share: onTime == null ? null : pgRound(onTime, 3),
    verdicts,
    master_overrides: countEv((e) => e.action === 'close' && e.payload.changed === true),
    top_issues: [...issues.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([code, count]) => ({
        code,
        name: db.dirs.fault_codes.find((f) => f.code === code)?.name ?? null,
        count,
      })),
    top_equipment: [...units.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([equipment_id, count]) => ({
        equipment_id,
        name: db.equipmentRow(equipment_id)?.name ?? '',
        count,
      })),
  };
}

// ---------------------------------------------------------------------------
// dashboard
// ---------------------------------------------------------------------------

export function dashboard(
  db: MockDb,
  now: Date,
  period: Period,
  filters: ReportFilters = {},
): Dashboard {
  const r = shiftReport(db, now, { ...period, filters });
  const from = Date.parse(period.from);
  const to = Date.parse(period.to);
  const nowMs = now.getTime();
  const units = new Map<number, { unplanned: number; downtime: number }>();
  for (const o of db.state.orders) {
    if (o.type !== 'unplanned') continue;
    const created = Date.parse(o.created_at);
    if (created < from || created >= to) continue;
    const eq = db.equipmentRow(o.equipment_id);
    if (!eq || (filters.area_id != null && eq.area_id !== filters.area_id)) continue;
    const row = units.get(eq.id) ?? { unplanned: 0, downtime: 0 };
    row.unplanned += 1;
    if (o.equipment_stopped)
      row.downtime += ((ms(o.done_at) ?? ms(o.cancelled_at) ?? nowMs) - created) / HOUR;
    units.set(eq.id, row);
  }
  const rating = computeRating({
    period,
    filters,
    employees: db.state.employees,
    brigades: db.dirs.brigades,
    orders: db.state.orders,
    events: db.state.events,
  });
  return {
    in_progress_now: r.counts.active_now,
    overdue_now: db.state.orders.filter(
      (o) =>
        isActive(o.status) &&
        Date.parse(o.due_at) < nowMs &&
        (filters.area_id == null || o.area_id === filters.area_id),
    ).length,
    reaction_avg_min: r.reaction_avg_min,
    execution_avg_min: r.execution_avg_min,
    downtime_hours: r.downtime_hours,
    on_time_share: r.on_time_share,
    closed: r.counts.closed,
    top_equipment: [...units.entries()]
      .sort((a, b) => b[1].unplanned - a[1].unplanned)
      .slice(0, 5)
      .map(([equipment_id, u]) => ({
        equipment_id,
        name: db.equipmentRow(equipment_id)?.name ?? '',
        unplanned: u.unplanned,
        downtime_h: pgRound(u.downtime, 1),
      })),
    best_workers: rating
      .filter((x) => x.kind === 'worker' && x.score != null && x.closed >= 3)
      .slice(0, 3)
      .map((x) => ({
        employee_id: x.id,
        short_name: x.name,
        score: x.score ?? 0,
        closed: x.closed,
      })),
  };
}

// ---------------------------------------------------------------------------
// shift counters, equipment history (PHASE_2 §2.2)
// ---------------------------------------------------------------------------

export function shiftCounters(
  db: MockDb,
  orders: readonly Order[],
  now: Date,
  shiftStart: Date,
): ShiftCounters {
  const start = shiftStart.getTime();
  const nowMs = now.getTime();
  return {
    issued: orders.filter((o) => Date.parse(o.created_at) >= start).length,
    done: orders.filter(
      (o) =>
        (o.status === 'done' || o.status === 'ai_review' || o.status === 'closed') &&
        ((ms(o.done_at) ?? -Infinity) >= start || (ms(o.closed_at) ?? -Infinity) >= start),
    ).length,
    overdue: orders.filter((o) => isActive(o.status) && nowMs > Date.parse(o.due_at)).length,
    stopped: db.state.equipment.filter((e) => e.is_stopped).length,
  };
}

export function equipmentHistory(
  db: MockDb,
  orders: readonly Order[],
  now: Date,
  equipmentId: number,
): EquipmentHistory {
  const eq = db.equipmentRow(equipmentId);
  if (!eq) throw new RotaError('BAD_INPUT', { details: 'equipment not found' });
  const mine = orders
    .filter((o) => o.equipment_id === equipmentId)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id);
  const downtimeMs = mine
    .filter((o) => o.equipment_stopped)
    .reduce(
      (sum, o) =>
        sum + ((ms(o.done_at) ?? ms(o.cancelled_at) ?? now.getTime()) - Date.parse(o.created_at)),
      0,
    );
  return {
    equipment: { ...eq },
    orders: db.views(mine, now),
    downtime_min: Math.round(downtimeMs / MIN),
  };
}

/** Board rows: active or rejected, done and ai_review, plus closed today (local). */
export function boardOrders(orders: readonly Order[], now: Date): Order[] {
  const today = startOfLocalDay(now).getTime();
  return orders.filter(
    (o) =>
      isActive(o.status) ||
      o.status === 'rejected' ||
      o.status === 'done' ||
      o.status === 'ai_review' ||
      (o.status === 'closed' && (ms(o.closed_at) ?? -Infinity) >= today),
  );
}

// ---------------------------------------------------------------------------
// insight cards
// ---------------------------------------------------------------------------

/** internal.period_label: «неделю», «30 дней», «3 месяца», else «N дней». */
export function periodLabel(period: Period): string {
  const d = Math.round((Date.parse(period.to) - Date.parse(period.from)) / DAY);
  if (d >= 6 && d <= 8) return 'неделю';
  if (d >= 28 && d <= 31) return '30 дней';
  if (d >= 85 && d <= 95) return '3 месяца';
  return `${d} ${plural(d, ['день', 'дня', 'дней'])}`;
}

/** internal.short_code_name: «Подшипник: перегрев, шум» → «подшипник». */
function shortCodeName(name: string): string {
  return (name.split(':')[0] ?? name).split(',')[0]?.trim().toLowerCase() ?? name;
}

const ru1 = (x: number): string => ruNumeric(pgRound(x, 1));

/** The ask box in mock mode: an area by keyword and a period by «неделя», «месяц», «3 месяца». */
export function parseMockQuery(
  query: string,
  period: Period,
): { period: Period; area_id: number | null } {
  const q = query.toLowerCase().replace(/ё/g, 'е');
  const areaByKeyword: readonly [RegExp, number][] = [
    [/карьер/, 1],
    [/дробл/, 2],
    [/обогащ/, 3],
    [/отгруз/, 4],
  ];
  const area = areaByKeyword.find(([re]) => re.test(q))?.[1] ?? null;
  const to = Date.parse(period.to);
  let days: number | null = null;
  if (/3 месяц|три месяц|квартал/.test(q)) days = 92;
  else if (/месяц/.test(q)) days = 30;
  else if (/недел/.test(q)) days = 7;
  else if (/сутк|сегодня/.test(q)) days = 1;
  return {
    period:
      days == null ? period : { from: new Date(to - days * DAY).toISOString(), to: period.to },
    area_id: area,
  };
}

/**
 * The scope of cards made without ai-insights (MockApi, and SupabaseApi when the function is out of reach): the
 * keyword reader of the ask box sets the period and the area, the cards are the rules cards.
 */
export function ruleInsightScope(
  input: InsightsInput,
  areaName: (id: number) => string | null,
): InsightScope {
  let period: Period = { from: input.from, to: input.to };
  let filters: ReportFilters = { ...(input.filters ?? {}) };
  const query = input.query?.replace(/\s+/g, ' ').trim() || null;
  if (query) {
    const parsed = parseMockQuery(query, period);
    period = parsed.period;
    if (parsed.area_id != null) filters = { ...filters, area_id: parsed.area_id };
  }
  return {
    from: period.from,
    to: period.to,
    label: periodLabel(period),
    filters,
    area_name: filters.area_id != null ? areaName(filters.area_id) : null,
    focus: [],
    query,
    parsed_by: query ? 'rules' : null,
    source: 'rules',
    cached: false,
    model: null,
  };
}

export function insightCards(db: MockDb, input: InsightsInput): Insight[] {
  let period: Period = { from: input.from, to: input.to };
  let filters: ReportFilters = { ...(input.filters ?? {}) };
  if (input.query) {
    const parsed = parseMockQuery(input.query, period);
    period = parsed.period;
    if (parsed.area_id != null) filters = { ...filters, area_id: parsed.area_id };
  }
  const from = Date.parse(period.from);
  const to = Date.parse(period.to);
  const per = periodLabel(period);
  const scoped = filterOrders(db, db.state.orders, filters);
  const unplanned = scoped.filter((o) => {
    const c = Date.parse(o.created_at);
    return o.type === 'unplanned' && c >= from && c < to;
  });
  const cards: Insight[] = [];
  const nameOf = (id: number): string => db.equipmentRow(id)?.name ?? '';

  // top equipment against the median of the units that failed
  const byUnit = new Map<number, Order[]>();
  for (const o of unplanned) byUnit.set(o.equipment_id, [...(byUnit.get(o.equipment_id) ?? []), o]);
  const ranked = [...byUnit.entries()].sort((a, b) => b[1].length - a[1].length);
  const median =
    percentileCont(
      ranked.map(([, list]) => list.length),
      0.5,
    ) ?? 0;
  const top = ranked[0];
  let topName: string | null = null;
  if (top && top[1].length >= 3 && median > 0 && top[1].length / median >= 2) {
    const [unitId, list] = top;
    topName = nameOf(unitId);
    const codes = new Map<string, number>();
    for (const o of list) {
      const c = o.fault_code ?? o.suggested_fault_code;
      if (c) codes.set(c, (codes.get(c) ?? 0) + 1);
    }
    const [code, count] = [...codes.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
    const codeName = shortCodeName(db.dirs.fault_codes.find((f) => f.code === code)?.name ?? '');
    const downtime = list
      .filter((o) => o.equipment_stopped)
      .reduce((sum, o) => sum + ((ms(o.done_at) ?? to) - Date.parse(o.created_at)) / HOUR, 0);
    const ratio = list.length / median;
    cards.push({
      kind: 'top_equipment',
      severity: 'critical',
      title: `${topName} ломается чаще всех`,
      body:
        `${topName}: ${list.length} ${plural(list.length, ['внеплановая остановка', 'внеплановые остановки', 'внеплановых остановок'])} за ${per}, ` +
        `${count} из них шифр ${code} (${codeName}). Это в ${ru1(ratio)} раза больше медианы по парку, простой ${ru1(downtime)} ч.`,
      recommendation:
        code === 'М-02'
          ? 'Рекомендуем проверить соосность привода и смазку подшипниковых узлов и включить узел в план ППР.'
          : 'Рекомендуем разобрать причины отказов и включить узел в план ППР.',
      evidence: {
        order_ids: list.map((o) => o.id),
        stats: {
          equipment_id: unitId,
          name: topName,
          unplanned: list.length,
          downtime_h: pgRound(downtime, 1),
          ratio_to_median: pgRound(ratio, 1),
          top_code: code,
          top_code_count: count,
        },
      },
    });
  }

  // repeat faults: the same code on the same unit 3 or more times
  const pairs = new Map<string, Order[]>();
  for (const o of unplanned) {
    const c = o.fault_code ?? o.suggested_fault_code;
    if (!c) continue;
    const key = `${o.equipment_id}|${c}`;
    pairs.set(key, [...(pairs.get(key) ?? []), o]);
  }
  const repeat = [...pairs.entries()]
    .filter(([, list]) => list.length >= 3)
    .sort((a, b) => b[1].length - a[1].length)
    .find(([key]) => nameOf(Number(key.split('|')[0])) !== topName);
  if (repeat) {
    const [key, list] = repeat;
    const [unitId, code] = key.split('|');
    const name = nameOf(Number(unitId));
    const times = list.map((o) => Date.parse(o.created_at)).sort((a, b) => a - b);
    const gaps = times.slice(1).map((t, i) => (t - (times[i] ?? t)) / DAY);
    cards.push({
      kind: 'repeat_faults',
      severity: 'warning',
      title: `Повторный шифр ${code}: ${name}`,
      body: `${name}: шифр ${code} повторился ${list.length} раз за ${per}, в среднем каждые ${ru1(percentileCont(gaps, 0.5) ?? 0)} дн. Ремонт не устраняет причину.`,
      recommendation: 'Рекомендуем провести разбор причин отказа с осмотром всего узла.',
      evidence: {
        order_ids: list.map((o) => o.id),
        stats: { equipment_id: Number(unitId), code, count: list.length },
      },
    });
  }

  // a worker whose repairs fail again on the same unit within 7 days
  const closedRepairs = scoped.filter((o) => {
    const c = ms(o.closed_at);
    return o.type === 'unplanned' && o.status === 'closed' && c != null && c >= from && c < to;
  });
  const allUnplanned = db.state.orders.filter((o) => o.type === 'unplanned');
  // chronic unit and code pairs are equipment faults, not the repairer's (4 or more in the window here)
  const pairCount = new Map<string, number>();
  for (const o of allUnplanned) {
    const c = Date.parse(o.created_at);
    const code = o.fault_code ?? o.suggested_fault_code;
    if (code == null || c < from - 7 * DAY || c >= to) continue;
    const key = `${o.equipment_id}|${code}`;
    pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
  }
  const repeated = (o: Order): boolean => {
    const done = ms(o.done_at);
    if (done == null || o.fault_code == null) return false;
    if ((pairCount.get(`${o.equipment_id}|${o.fault_code}`) ?? 0) >= 4) return false;
    return allUnplanned.some(
      (r) =>
        r.id !== o.id &&
        r.equipment_id === o.equipment_id &&
        (r.fault_code ?? r.suggested_fault_code) === o.fault_code &&
        Date.parse(r.created_at) > done &&
        Date.parse(r.created_at) <= done + 7 * DAY,
    );
  };
  const byWorker = new Map<string, Order[]>();
  for (const o of closedRepairs)
    byWorker.set(o.assignee_id, [...(byWorker.get(o.assignee_id) ?? []), o]);
  const worst = [...byWorker.entries()]
    .map(([id, list]) => {
      const others = closedRepairs.filter((o) => o.assignee_id !== id);
      return {
        id,
        list,
        share: avg(list.map((o) => (repeated(o) ? 1 : 0))) ?? 0,
        team: avg(others.map((o) => (repeated(o) ? 1 : 0))) ?? 0,
        rework: avg(list.map((o) => (o.rework_count > 0 ? 1 : 0))) ?? 0,
      };
    })
    .filter((w) => w.list.length >= 3 && w.share >= 0.3 && w.share >= 2 * w.team)
    .sort((a, b) => b.share - a.share || b.list.length - a.list.length)[0];
  if (worst) {
    const name = db.employee(worst.id)?.short_name ?? '';
    cards.push({
      kind: 'worker_repeats',
      severity: 'warning',
      title: `Повторные отказы после ремонтов: ${name}`,
      body: `${name}: ${Math.round(worst.share * 100)}% ремонтов с повторным отказом того же узла в течение 7 дней, по команде ${Math.round(worst.team * 100)}%. На доработку уходило ${Math.round(worst.rework * 100)}% нарядов.`,
      recommendation: 'Рекомендуем разобрать последние ремонты с мастером и назначить наставника.',
      evidence: {
        order_ids: worst.list.map((o) => o.id),
        stats: {
          employee_id: worst.id,
          repairs: worst.list.length,
          repeat_share: pgRound(worst.share, 3),
          team_share: pgRound(worst.team, 3),
        },
      },
    });
  }

  // materials: a brigade spending far above the norm on one code
  const closedInPeriod = scoped.filter((o) => {
    const c = ms(o.closed_at);
    return o.status === 'closed' && c != null && c >= from && c < to && o.fault_code != null;
  });
  const usage = new Map<
    string,
    {
      orders: Set<number>;
      qty: number;
      ref: number;
      brigade: number;
      material: number;
      code: string;
    }
  >();
  for (const o of closedInPeriod) {
    const brigade = o.brigade_id ?? db.employee(o.assignee_id)?.brigade_id ?? null;
    if (brigade == null || o.fault_code == null) continue;
    const typical = db.dirs.work_norms.find((n) => n.fault_code === o.fault_code)?.typical ?? [];
    for (const m of db.state.materials) {
      if (m.order_id !== o.id) continue;
      const ref = typical.find((t) => t.material_id === m.material_id)?.qty;
      if (ref == null || ref <= 0) continue;
      const key = `${brigade}|${o.fault_code}|${m.material_id}`;
      const row = usage.get(key) ?? {
        orders: new Set<number>(),
        qty: 0,
        ref,
        brigade,
        material: m.material_id,
        code: o.fault_code,
      };
      row.orders.add(o.id);
      row.qty += m.qty;
      usage.set(key, row);
    }
  }
  const over = [...usage.values()]
    .map((u) => ({ ...u, avg: u.qty / u.orders.size }))
    .filter((u) => u.orders.size >= 3 && u.avg / u.ref >= 1.8)
    .sort((a, b) => b.avg / b.ref - a.avg / a.ref)[0];
  if (over) {
    const brigadeName = db.brigade(over.brigade)?.name ?? '';
    const mat = db.material(over.material);
    cards.push({
      kind: 'materials',
      severity: 'warning',
      title: `Перерасход: ${mat?.name ?? ''}, ${brigadeName.toLowerCase()}`,
      body: `${brigadeName}: расход «${mat?.name ?? ''}» по шифру ${over.code} в ${ru1(over.avg / over.ref)} раза выше нормы (в среднем ${ru1(over.avg)} ${mat?.unit ?? ''} при норме ${ruNumeric(over.ref)}, ${over.orders.size} ${plural(over.orders.size, ['наряд', 'наряда', 'нарядов'])}).`,
      recommendation: 'Рекомендуем проверить списание материалов и технологию работ в бригаде.',
      evidence: {
        order_ids: [...over.orders],
        stats: {
          brigade_id: over.brigade,
          material_id: over.material,
          code: over.code,
          avg_qty: pgRound(over.avg, 2),
          reference_qty: over.ref,
        },
      },
    });
  }

  return cards;
}

/** public.rating over the store, with the viewer rule (a worker sees only own row). */
export function rating(
  db: MockDb,
  period: Period,
  filters: ReportFilters | undefined,
  viewer: Session,
) {
  return computeRating({
    period,
    filters,
    employees: db.state.employees,
    brigades: db.dirs.brigades,
    orders: db.state.orders,
    events: db.state.events,
    viewer: { id: viewer.user_id, role: viewer.role },
  });
}
