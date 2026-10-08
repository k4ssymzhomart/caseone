// Priority and order type labels, tones and sort order (CLAUDE.md §6, §8).

import { PRIORITIES, type OrderType, type Priority } from './enums';
import type { Tone } from './status';

export const PRIORITY_LABEL: Readonly<Record<Priority, string>> = {
  emergency: 'Аварийный',
  high: 'Высокий',
  normal: 'Обычный',
  planned: 'Плановый',
};

/** Lowercase labels for message templates: «Приоритет: аварийный.» */
export const PRIORITY_LABEL_LOWER: Readonly<Record<Priority, string>> = {
  emergency: 'аварийный',
  high: 'высокий',
  normal: 'обычный',
  planned: 'плановый',
};

const PRIORITY_TONE: Readonly<Record<Priority, Tone>> = {
  emergency: 'critical',
  high: 'warning',
  normal: 'neutral',
  planned: 'info',
};

export function priorityTone(priority: Priority): Tone {
  return PRIORITY_TONE[priority];
}

/** Sort rank: emergency 0 … planned 3. */
export const PRIORITY_RANK: Readonly<Record<Priority, number>> = {
  emergency: 0,
  high: 1,
  normal: 2,
  planned: 3,
};

/** Emergency first, then by due_at ascending (the order of orders.list). */
export function compareOrders(
  a: { priority: Priority; due_at: string },
  b: { priority: Priority; due_at: string },
): number {
  const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (byPriority !== 0) return byPriority;
  return Date.parse(a.due_at) - Date.parse(b.due_at);
}

/** Priorities in sort order (emergency first). */
export const PRIORITIES_SORTED: readonly Priority[] = [...PRIORITIES];

export const ORDER_TYPE_LABEL: Readonly<Record<OrderType, string>> = {
  planned: 'Плановый',
  unplanned: 'Внеплановый',
};

/** Default deadline by priority when nothing else sets it, hours (create_order). */
export const PRIORITY_DEFAULT_HOURS: Readonly<Record<Priority, number>> = {
  emergency: 2,
  high: 4,
  normal: 8,
  planned: 24,
};
