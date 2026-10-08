// What a timeline event says (CLAUDE.md §12), shared by the order page and its PDF: who acted and the detail lines
// (reason, comment, verdict, the reassignment, the priority change). Pure.
import {
  formatScore,
  PRIORITY_LABEL,
  reasonLabel,
  VERDICT_LABEL,
  type OrderEvent,
  type Priority,
  type Verdict,
} from '@rota/shared';
import { t } from './strings';

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const isVerdict = (v: unknown): v is Verdict => typeof v === 'string' && v in VERDICT_LABEL;
const isPriority = (v: unknown): v is Priority => typeof v === 'string' && v in PRIORITY_LABEL;

/** The short name of the actor; «ИИ» for the system steps of the AI check, «Система» otherwise. */
export function eventActor(e: OrderEvent, names: ReadonlyMap<string, string>): string {
  if (e.actor_id == null) {
    return e.action === 'review_started' || e.action === 'ai_result' ? t('order.actor.ai') : t('event.actor.system');
  }
  return names.get(e.actor_id) ?? t('event.actor.system');
}

/** The detail lines under the event title. */
export function eventLines(
  e: OrderEvent,
  names: ReadonlyMap<string, string>,
  brigades: ReadonlyMap<number, string>,
): string[] {
  const name = (id: unknown) => (typeof id === 'string' ? (names.get(id) ?? null) : null);
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
}
