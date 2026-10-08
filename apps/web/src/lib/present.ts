// OrderView → what the panel shows, in the same words as the mobile app (apps/mobile/src/features/orders/present.ts):
// eyebrow, time, the board badge of CLAUDE.md §6, tones.
import {
  formatDue,
  formatLeft,
  hhmm,
  isActive,
  ORDER_TYPE_LABEL,
  PRIORITY_LABEL,
  reasonLabel,
  statusTone,
  VERDICT_LABEL,
  verdictTone,
  type OrderView,
  type Tone,
} from '@rota/shared';
import { t } from './i18n';

/** The fields the order card needs; a full OrderView fits. */
export type OrderCardOrder = Pick<
  OrderView,
  | 'id'
  | 'number'
  | 'type'
  | 'priority'
  | 'status'
  | 'description'
  | 'equipment_name'
  | 'area_name'
  | 'assignee_short_name'
  | 'brigade_name'
  | 'due_at'
  | 'is_overdue'
  | 'last_reason'
  | 'ai_verdict'
  | 'ai_needs_master_review'
  | 'final_verdict'
  | 'final_score'
  | 'done_at'
  | 'closed_at'
  | 'cancelled_at'
  | 'rejected_at'
>;

/** «№147 · АВАРИЙНЫЙ» for emergencies, otherwise «№147 · ВНЕПЛАНОВЫЙ» (the eyebrow style uppercases it). */
export function orderEyebrow(o: Pick<OrderView, 'number' | 'priority' | 'type'>): string {
  const kind = o.priority === 'emergency' ? PRIORITY_LABEL.emergency : ORDER_TYPE_LABEL[o.type];
  return `№${o.number} · ${kind}`;
}

/**
 * Active: the deadline «до 11:30» (`left` says «осталось 24 мин»), or «просрочен на 12 мин» once it passed;
 * finished: the time it ended.
 */
export function orderTime(o: OrderCardOrder, now: Date): { text: string; left: string; overdue: boolean } {
  if (isActive(o.status)) {
    const overdue = o.is_overdue || now.getTime() > Date.parse(o.due_at);
    const left = formatLeft(o.due_at, now);
    return { text: overdue ? left : formatDue(o.due_at, now), left, overdue };
  }
  const end = o.closed_at ?? o.done_at ?? o.cancelled_at ?? o.rejected_at;
  return { text: end ? hhmm(end) : '', left: '', overdue: false };
}

export interface Badge {
  text: string;
  tone: Tone;
}

/** The badge next to the status pill (board map of CLAUDE.md §6). */
export function orderBadge(o: OrderCardOrder): Badge | null {
  switch (o.status) {
    case 'rejected':
      return { text: t('board.badge.rejected', { reason: reasonLabel(o.last_reason) }), tone: 'critical' };
    case 'paused':
      return { text: t('board.badge.paused', { reason: reasonLabel(o.last_reason) }), tone: 'warning' };
    case 'rework':
      return { text: t('board.badge.rework'), tone: 'critical' };
    case 'ai_review':
      if (o.ai_needs_master_review) return { text: t('board.badge.needs_master_review'), tone: 'info' };
      return o.ai_verdict ? { text: t('board.badge.waiting_master'), tone: 'warning' } : null;
    case 'closed':
      return o.final_verdict
        ? {
            text: `${VERDICT_LABEL[o.final_verdict]}${o.final_score != null ? ` · ${o.final_score}` : ''}`,
            tone: verdictTone(o.final_verdict),
          }
        : null;
    default:
      return null;
  }
}

/** Pill tone of the status (overdue is said by the red time, never by repainting the status). */
export function orderTone(o: Pick<OrderCardOrder, 'status'>): Tone {
  return statusTone(o.status);
}
