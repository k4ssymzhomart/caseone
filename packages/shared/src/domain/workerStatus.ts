// Worker and brigade status, the same rules as public.v_worker_status and public.v_brigade_status
// (supabase/migrations/20261008100005_rota_views.sql, CLAUDE.md §7). MockApi builds its views with these.

import type { Status } from './enums';
import type { Brigade, BrigadeStatusView, Employee, Equipment, Order, WorkerStatusView } from './types';

/** Statuses counted in queue_count: everything assigned and not finished, except the order in progress. */
export const WORKER_QUEUE_STATUSES = [
  'issued',
  'accepted',
  'queued',
  'paused',
  'rework',
] as const satisfies readonly Status[];

type StatusOrder = Pick<Order, 'id' | 'number' | 'assignee_id' | 'status' | 'started_at' | 'equipment_id'>;
type StatusEmployee = Pick<
  Employee,
  'id' | 'tab_no' | 'short_name' | 'specialty' | 'grade' | 'brigade_id' | 'shift' | 'on_shift'
>;

/**
 * One row of v_worker_status: off when not on shift; working when an order is in progress (the latest
 * started); queue when anything else is assigned and open; free otherwise.
 */
export function deriveWorkerStatus(
  employee: StatusEmployee,
  orders: readonly StatusOrder[],
  equipment: readonly Pick<Equipment, 'id' | 'name'>[] = [],
): WorkerStatusView {
  const own = orders.filter((o) => o.assignee_id === employee.id);
  const current = own
    .filter((o) => o.status === 'in_progress')
    .sort((a, b) => {
      // order by started_at desc nulls last
      if (a.started_at == null) return b.started_at == null ? 0 : 1;
      if (b.started_at == null) return -1;
      return Date.parse(b.started_at) - Date.parse(a.started_at);
    })[0];
  const queueCount = own.filter((o) =>
    (WORKER_QUEUE_STATUSES as readonly Status[]).includes(o.status),
  ).length;
  const status = !employee.on_shift
    ? 'off'
    : current
      ? 'working'
      : queueCount > 0
        ? 'queue'
        : 'free';
  return {
    id: employee.id,
    tab_no: employee.tab_no,
    short_name: employee.short_name,
    specialty: employee.specialty,
    grade: employee.grade,
    brigade_id: employee.brigade_id,
    shift: employee.shift,
    on_shift: employee.on_shift,
    current_order_id: current?.id ?? null,
    current_order_number: current?.number ?? null,
    current_equipment_name: current
      ? (equipment.find((e) => e.id === current.equipment_id)?.name ?? null)
      : null,
    queue_count: queueCount,
    status,
  };
}

/** Every worker (role = worker) of the directory, in directory order. */
export function deriveWorkerStatuses(
  employees: readonly (StatusEmployee & Pick<Employee, 'role'>)[],
  orders: readonly StatusOrder[],
  equipment: readonly Pick<Equipment, 'id' | 'name'>[] = [],
): WorkerStatusView[] {
  return employees
    .filter((e) => e.role === 'worker')
    .map((e) => deriveWorkerStatus(e, orders, equipment));
}

/** v_brigade_status: workers on shift, free, and busy (working or queue) per brigade. */
export function deriveBrigadeStatuses(
  brigades: readonly Brigade[],
  employees: readonly Pick<Employee, 'id' | 'short_name'>[],
  workers: readonly WorkerStatusView[],
): BrigadeStatusView[] {
  return brigades.map((b) => {
    const members = workers.filter((w) => w.brigade_id === b.id);
    return {
      id: b.id,
      name: b.name,
      leader_id: b.leader_id,
      leader_short_name: employees.find((e) => e.id === b.leader_id)?.short_name ?? null,
      on_shift_count: members.filter((w) => w.on_shift).length,
      free_count: members.filter((w) => w.status === 'free').length,
      busy_count: members.filter((w) => w.status === 'working' || w.status === 'queue').length,
    };
  });
}
