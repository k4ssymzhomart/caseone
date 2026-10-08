// Every event of the order, oldest first (CLAUDE.md §12): time in mono, a status dot, the action, who did it and
// what it carried (reason, comment, verdict, the reassignment, the priority change). Reject events get the master's
// «Признать обоснованным» (mark_reject_justified: the rating stops counting that refusal) or the «Обоснован» tag.
import {
  formatDateTime,
  hhmm,
  isSameLocalDay,
  STATUS_LABEL,
  statusTone,
  type Employee,
  type OrderEvent,
} from '@rota/shared';
import { useMemo } from 'react';
import { Button } from '@/components/rota';
import { StatusDot, Tag } from '@/components/ui';
import { tData } from '@/lib/i18n';
import { eventActor, eventLines } from './eventText';
import { t } from './strings';
import styles from './order.module.css';

interface TimelineProps {
  events: readonly OrderEvent[];
  employees: readonly Employee[];
  brigades: ReadonlyMap<number, string>;
  now: Date;
  /** Offered on reject events not yet marked justified (masters only). */
  onJustify?: (event: OrderEvent) => void;
  justifying?: boolean;
}

export function Timeline({ events, employees, brigades, now, onJustify, justifying }: TimelineProps) {
  const names = useMemo(() => new Map(employees.map((e) => [e.id, e.short_name])), [employees]);
  const justified = useMemo(
    () =>
      new Set(
        events
          .filter((e) => e.action === 'mark_reject_justified')
          .map((e) => Number(e.payload.reject_event_id)),
      ),
    [events],
  );

  if (events.length === 0) return <p className={styles.muted}>{t('order.ev.empty')}</p>;

  const details = (e: OrderEvent): string[] => eventLines(e, names, brigades);
  const actor = (e: OrderEvent): string => eventActor(e, names);

  return (
    <ol className={styles.timeline}>
      {events.map((e) => {
        const moved = e.to_status != null && e.to_status !== e.from_status;
        const lines = details(e);
        const isReject = e.action === 'reject';
        const isJustified = isReject && justified.has(e.id);
        return (
          <li key={e.id} className={styles.event}>
            <time className={styles.eventTime} dateTime={e.created_at}>
              {isSameLocalDay(e.created_at, now) ? hhmm(e.created_at) : formatDateTime(e.created_at)}
            </time>
            <span className={styles.eventDot}>
              <StatusDot tone={moved && e.to_status ? statusTone(e.to_status) : 'off'} />
            </span>
            <div className={styles.eventBody}>
              <span className={styles.eventTitle}>
                {tData(`event.${e.action}`)}
                {moved && e.to_status && e.action !== 'create' && tData(`event.${e.action}`) !== STATUS_LABEL[e.to_status] ? (
                  <span className={styles.eventStatus}> · {STATUS_LABEL[e.to_status]}</span>
                ) : null}
              </span>
              <span className={styles.eventActor}>{actor(e)}</span>
              {lines.map((line, i) => (
                <span key={i} className={styles.eventDetail}>
                  {line}
                </span>
              ))}
              {isJustified ? (
                <span className={styles.eventAction}>
                  <Tag>{t('order.ev.justified_tag')}</Tag>
                </span>
              ) : isReject && onJustify ? (
                <span className={styles.eventAction}>
                  <Button variant="secondary" onClick={() => onJustify(e)} disabled={justifying}>
                    {t('order.ev.mark_justified')}
                  </Button>
                </span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
