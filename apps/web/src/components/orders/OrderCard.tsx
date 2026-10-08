// The industrial order card (PHASE_0 §6.9 OrderCard, web): a 4 px priority bar on the left, eyebrow
// «№147 · ВНЕПЛАНОВЫЙ», the equipment as the headline, «участок · описание», the time in mono (red when overdue),
// then the status pill, the board badge and the assignee. Pass `to` to make it a link (board, shift lists).
import { STATUS_LABEL } from '@rota/shared';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { orderBadge, orderEyebrow, orderTime, orderTone, type OrderCardOrder } from '@/lib/present';
import { Pill } from '../ui';
import styles from './OrderCard.module.css';

interface OrderCardProps {
  order: OrderCardOrder;
  now: Date;
  /** Route to open, usually paths.order(order.id). */
  to?: string;
  /** Who to show at the bottom right; default the assignee (and the brigade). */
  person?: ReactNode;
}

export function OrderCard({ order: o, now, to, person }: OrderCardProps) {
  const time = orderTime(o, now);
  const badge = orderBadge(o);
  const who = person ?? (o.brigade_name ? `${o.assignee_short_name} · ${o.brigade_name}` : o.assignee_short_name);
  const body = (
    <>
      <span className={styles.bar} data-priority={o.priority} aria-hidden="true" />
      <div className={styles.top}>
        <span className={styles.eyebrow}>{orderEyebrow(o)}</span>
        {time.text ? (
          <span className={styles.time} data-overdue={time.overdue || undefined} title={time.left || undefined}>
            {time.text}
          </span>
        ) : null}
      </div>
      <div className={styles.headline}>{o.equipment_name}</div>
      <div className={styles.subtitle}>
        {o.area_name} · {o.description}
      </div>
      <div className={styles.bottom}>
        <Pill tone={orderTone(o)}>{STATUS_LABEL[o.status]}</Pill>
        {badge ? <Pill tone={badge.tone}>{badge.text}</Pill> : null}
        <span className={styles.person}>{who}</span>
      </div>
    </>
  );
  return to ? (
    <Link to={to} className={styles.card} data-link>
      {body}
    </Link>
  ) : (
    <div className={styles.card}>{body}</div>
  );
}
