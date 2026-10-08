// Status labels, the board column map and pill tones (CLAUDE.md §6, §7).
// boardColumn() is the same rule as v_orders.board_column in 20261008100005_rota_views.sql.

import {
  ACTIVE_STATUSES,
  type ActiveStatus,
  type BoardColumn,
  type Status,
  type Verdict,
  type WorkerState,
} from './enums';
import type { Order } from './types';

export { ACTIVE_STATUSES, BOARD_COLUMNS } from './enums';
export type { ActiveStatus, BoardColumn } from './enums';

export const STATUS_LABEL: Readonly<Record<Status, string>> = {
  issued: 'Выдан',
  accepted: 'Принят в работу',
  queued: 'В очереди',
  rejected: 'Отклонён',
  in_progress: 'В работе',
  paused: 'Приостановлен',
  done: 'Исполнено',
  ai_review: 'Проверка ИИ',
  rework: 'На доработку',
  closed: 'Закрыт',
  cancelled: 'Отменён',
};

export function isActive(status: Status): status is ActiveStatus {
  return (ACTIVE_STATUSES as readonly Status[]).includes(status);
}

function toMs(value: string | Date): number {
  return typeof value === 'string' ? Date.parse(value) : value.getTime();
}

/** Active and past its deadline. Once done, deadline tracking stops. */
export function isOverdue(
  order: Pick<Order, 'status' | 'due_at'>,
  now: Date = new Date(),
): boolean {
  return isActive(order.status) && now.getTime() > toMs(order.due_at);
}

export const BOARD_COLUMN_LABEL: Readonly<Record<BoardColumn, string>> = {
  issued: 'Выданы',
  accepted: 'Приняты',
  queued: 'В очереди',
  in_progress: 'В работе',
  done: 'Выполнены',
  overdue: 'Просрочены',
};

/**
 * Board column of an order: every overdue active order goes to «Просрочены»; rejected sits in «Выданы»;
 * paused and rework sit in «В работе»; done, ai_review and closed in «Выполнены»; cancelled has no column.
 */
export function boardColumn(
  order: Pick<Order, 'status' | 'due_at'>,
  now: Date = new Date(),
): BoardColumn | null {
  if (isOverdue(order, now)) return 'overdue';
  switch (order.status) {
    case 'issued':
    case 'rejected':
      return 'issued';
    case 'accepted':
      return 'accepted';
    case 'queued':
      return 'queued';
    case 'in_progress':
    case 'paused':
    case 'rework':
      return 'in_progress';
    case 'done':
    case 'ai_review':
    case 'closed':
      return 'done';
    case 'cancelled':
      return null;
  }
}

/**
 * Pill tones. The first eight are the @rota/design status extension colors
 * (free, working, queue, off, success, warning, critical, info); 'neutral' is a plain pill.
 */
export type Tone =
  'free' | 'working' | 'queue' | 'off' | 'success' | 'warning' | 'critical' | 'info' | 'neutral';

const STATUS_TONE: Readonly<Record<Status, Tone>> = {
  issued: 'info',
  accepted: 'info',
  queued: 'queue',
  rejected: 'critical',
  in_progress: 'working',
  paused: 'warning',
  done: 'success',
  ai_review: 'info',
  rework: 'critical',
  closed: 'success',
  cancelled: 'off',
};

export function statusTone(status: Status): Tone {
  return STATUS_TONE[status];
}

export const VERDICT_LABEL: Readonly<Record<Verdict, string>> = {
  accepted: 'Принято',
  accepted_with_remarks: 'Принято с замечаниями',
  rework: 'Требует доработки',
};

const VERDICT_TONE: Readonly<Record<Verdict, Tone>> = {
  accepted: 'success',
  accepted_with_remarks: 'warning',
  rework: 'critical',
};

export function verdictTone(verdict: Verdict): Tone {
  return VERDICT_TONE[verdict];
}

/** Short worker state labels. «Выполняет наряд №…» and «В очереди N» need the number: use workerStateText. */
export const WORKER_STATE_LABEL: Readonly<Record<WorkerState, string>> = {
  free: 'Свободен',
  working: 'Выполняет наряд',
  queue: 'В очереди',
  off: 'Не на смене',
};

export function workerStateTone(state: WorkerState): Tone {
  return state;
}

/** «Свободен», «Выполняет наряд №147», «В очереди 2», «Не на смене» (CLAUDE.md §7). */
export function workerStateText(w: {
  status: WorkerState;
  current_order_number?: number | null;
  queue_count?: number;
}): string {
  switch (w.status) {
    case 'free':
      return WORKER_STATE_LABEL.free;
    case 'working':
      return w.current_order_number != null
        ? `${WORKER_STATE_LABEL.working} №${w.current_order_number}`
        : WORKER_STATE_LABEL.working;
    case 'queue':
      return `${WORKER_STATE_LABEL.queue} ${w.queue_count ?? 0}`;
    case 'off':
      return WORKER_STATE_LABEL.off;
  }
}
