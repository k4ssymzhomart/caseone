// OrderView → what the kit shows. One place for eyebrows, badges, times and tones, so the worker list,
// the board and the master screens say the same thing.
import {
  ORDER_TYPE_LABEL,
  PRIORITY_LABEL,
  STATUS_LABEL,
  VERDICT_LABEL,
  formatDuration,
  hhmm,
  isActive,
  minutesBetween,
  reasonLabel,
  statusTone,
  verdictTone,
  type OrderView,
  type Tone,
} from '@rota/shared';

import { t } from '@/lib/i18n';
import type { OrderCardProps } from '@/ui/OrderCard';
import type { PillTone } from '@/ui/Pill';
import type { TagTone } from '@/ui/Tag';

export type Viewer = 'worker' | 'master';

export function pillTone(tone: Tone): PillTone {
  return tone as PillTone;
}

export function tagTone(tone: Tone): TagTone {
  if (tone === 'critical' || tone === 'warning' || tone === 'info') return tone;
  return 'neutral';
}

/** «№147 · АВАРИЙНЫЙ» for emergencies, otherwise «№147 · ВНЕПЛАНОВЫЙ» (monoCaps uppercases it). */
export function orderEyebrow(o: Pick<OrderView, 'number' | 'priority' | 'type'>): string {
  const kind = o.priority === 'emergency' ? PRIORITY_LABEL.emergency : ORDER_TYPE_LABEL[o.type];
  return `№${o.number} · ${kind}`;
}

/** Overdue active order → «−12 мин»; active → «до 11:30»; finished → done time. */
export function orderTime(o: OrderView, now: Date): { text: string; overdue: boolean } {
  if (isActive(o.status)) {
    if (o.is_overdue || now.getTime() > new Date(o.due_at).getTime()) {
      const late = Math.max(1, minutesBetween(o.due_at, now));
      return { text: t('order.lateShort', { duration: formatDuration(late) }), overdue: true };
    }
    return { text: t('order.due', { time: hhmm(o.due_at) }), overdue: false };
  }
  const end = o.closed_at ?? o.done_at ?? o.cancelled_at ?? o.rejected_at;
  return { text: end ? hhmm(end) : '', overdue: false };
}

/** The badge next to the status pill (CLAUDE.md §6 board map). */
export function orderBadge(o: OrderView): { text: string; tone: TagTone } | null {
  switch (o.status) {
    case 'rejected':
      return { text: t('order.badge.rejected', { reason: reasonLabel(o.last_reason) }), tone: 'critical' };
    case 'paused':
      return { text: t('order.badge.paused', { reason: reasonLabel(o.last_reason) }), tone: 'warning' };
    case 'rework':
      return { text: t('order.badge.rework'), tone: 'critical' };
    case 'ai_review':
      // The pill already says «Проверка ИИ»; the badge only adds that the master must confirm.
      return o.ai_needs_master_review || o.ai_verdict ? { text: t('order.badge.waitsMaster'), tone: 'warning' } : null;
    case 'closed':
      return o.final_verdict
        ? { text: `${VERDICT_LABEL[o.final_verdict]} · ${o.final_score ?? ''}`, tone: tagTone(verdictTone(o.final_verdict)) }
        : null;
    default:
      return null;
  }
}

export function orderCardProps(
  o: OrderView,
  opts: { viewer: Viewer; now: Date; onPress?: () => void },
): OrderCardProps {
  const time = orderTime(o, opts.now);
  const badge = orderBadge(o);
  const overdue = time.overdue;
  return {
    eyebrow: orderEyebrow(o),
    equipment: o.equipment_name,
    subtitle: `${o.area_name} · ${o.description}`,
    priority: o.priority,
    timeLeft: time.text,
    overdue,
    statusLabel: STATUS_LABEL[o.status],
    statusTone: pillTone(overdue ? 'critical' : statusTone(o.status)),
    ...(badge ? { badge: badge.text, badgeTone: badge.tone } : overdue ? { badge: t('order.badge.overdue'), badgeTone: 'critical' as TagTone } : {}),
    person: opts.viewer === 'master' ? (o.brigade_name ? `${o.assignee_short_name} · ${o.brigade_name}` : o.assignee_short_name) : o.master_short_name,
    ...(opts.onPress ? { onPress: opts.onPress } : {}),
  };
}
