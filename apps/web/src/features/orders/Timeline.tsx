// Every event of the order, oldest first (CLAUDE.md §12): time in mono, a status dot, the action, who did it and
// what it carried (reason, comment, verdict, the reassignment, the priority change). Reject events get the master's
// «Признать обоснованным» (mark_reject_justified: the rating stops counting that refusal) or the «Обоснован» tag.
import {
  formatDateTime,
  formatScore,
  hhmm,
  isSameLocalDay,
  PRIORITY_LABEL,
  reasonLabel,
  STATUS_LABEL,
  statusTone,
  VERDICT_LABEL,
  type Employee,
  type OrderEvent,
  type Priority,
  type Verdict,
} from '@rota/shared';
import { useMemo } from 'react';
import { Button } from '@/components/rota';
import { StatusDot, Tag } from '@/components/ui';
import { tData } from '@/lib/i18n';
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

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const isVerdict = (v: unknown): v is Verdict => typeof v === 'string' && v in VERDICT_LABEL;
const isPriority = (v: unknown): v is Priority => typeof v === 'string' && v in PRIORITY_LABEL;

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

  const name = (id: unknown) => (typeof id === 'string' ? (names.get(id) ?? null) : null);
  const actor = (e: OrderEvent) => {
    if (e.actor_id == null) {
      return e.action === 'review_started' || e.action === 'ai_result' ? t('order.actor.ai') : t('event.actor.system');
    }
    return names.get(e.actor_id) ?? t('event.actor.system');
  };

  const details = (e: OrderEvent): string[] => {
    const p = e.payload ?? {};
    const out: string[] = [];
    switch (e.action) {
      case 'create': {
        const who = name(p.assignee_id);
        const brigade = num(p.brigade_id) != null ? brigades.get(num(p.brigade_id) as number) : undefined;
        if (who && brigade) out.push(t('order.ev.brigade', { name: who, brigade }));
        else if (who) out.push(t('order.ev.assignee', { name: who }));
        break;
      }
      case 'reject':
      case 'pause':
        if (e.reason) out.push(reasonLabel(e.reason));
        if (p.auto === true) out.push(t('order.ev.auto_pause'));
        break;
      case 'complete':
        if (str(p.fault_code)) out.push(t('order.ev.code', { code: str(p.fault_code) }));
        break;
      case 'review_started':
        if (num(p.attempt) != null) out.push(t('order.ev.attempt', { n: num(p.attempt) }));
        break;
      case 'ai_result':
        if (isVerdict(p.verdict) && num(p.score) != null) {
          out.push(t('order.ev.verdict', { verdict: VERDICT_LABEL[p.verdict], score: formatScore(num(p.score) as number) }));
        }
        if (p.needs_master_review === true) out.push(t('order.ev.needs_master'));
        break;
      case 'close':
        if (isVerdict(p.final_verdict) && num(p.final_score) != null) {
          out.push(
            t('order.ev.verdict', { verdict: VERDICT_LABEL[p.final_verdict], score: formatScore(num(p.final_score) as number) }),
          );
        }
        if (p.changed === true) out.push(t('order.ev.changed'));
        break;
      case 'reassign': {
        const from = name(p.from_assignee_id);
        const to = name(p.to_assignee_id);
        if (from && to) out.push(t('order.ev.move', { from, to }));
        else if (to) out.push(t('order.ev.assignee', { name: to }));
        break;
      }
      case 'set_priority':
        if (isPriority(p.from_priority) && isPriority(p.to_priority)) {
          out.push(t('order.ev.move', { from: PRIORITY_LABEL[p.from_priority], to: PRIORITY_LABEL[p.to_priority] }));
        }
        break;
      case 'cancel':
        if (e.reason && e.reason !== e.comment) out.push(e.reason);
        break;
      default:
        break;
    }
    if (e.comment) out.push(`«${e.comment}»`);
    return out;
  };

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
