// The worker's active orders split into the three sections of «Мои наряды» (PHASE_0 §7.1).
import type { OrderView, Status } from '@rota/shared';

/** «В работе»: the order in progress first, then rework, paused, accepted. */
const WORKING_RANK: Partial<Record<Status, number>> = { in_progress: 0, rework: 1, paused: 2, accepted: 3 };

export function splitWorkerOrders(list: readonly OrderView[]) {
  const emergency = list.filter((o) => o.priority === 'emergency');
  const rest = list.filter((o) => o.priority !== 'emergency');
  const working = rest
    .filter((o) => WORKING_RANK[o.status] !== undefined)
    .sort((a, b) => (WORKING_RANK[a.status] ?? 0) - (WORKING_RANK[b.status] ?? 0));
  // New issued orders first (they wait for an answer), then the queue in the worker's own order.
  const issued = rest.filter((o) => o.status === 'issued');
  const queued = rest
    .filter((o) => o.status === 'queued')
    .sort((a, b) => (a.queue_position ?? Number.MAX_SAFE_INTEGER) - (b.queue_position ?? Number.MAX_SAFE_INTEGER));
  return { emergency, working, queue: [...issued, ...queued] };
}
