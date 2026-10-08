// The master's dialogs on /orders/:id (CLAUDE.md §6, §12): «Вернуть на доработку» (comment required), «Изменить
// оценку» (close with final_verdict, final_score, comment), «Отменить наряд» (reason required, destructive confirm),
// «Изменить приоритет». Each one makes its client_action_id when it opens and reuses it for retries; errors stay
// inside the dialog, success closes it and shows the HUD.
import {
  PRIORITIES,
  PRIORITY_LABEL,
  priorityTone,
  VERDICT_LABEL,
  VERDICTS,
  formatScore,
  type AiReview,
  type OrderView,
  type Priority,
  type Verdict,
} from '@rota/shared';
import { useRef, useState } from 'react';
import { Button } from '@/components/rota';
import { Field, FormError, Input, Pill, Segmented } from '@/components/ui';
import { newActionId } from '@/lib/api';
import { Dialog, TextArea } from './Dialog';
import { t } from './strings';
import { errorText, useActionRunner } from './useActionRunner';
import styles from './reassign.module.css';

type DialogOrder = Pick<OrderView, 'id' | 'number' | 'equipment_name' | 'priority'>;

interface BaseProps {
  order: DialogOrder;
  onClose: () => void;
}

function eyebrow(o: DialogOrder): string {
  return `№${o.number} · ${o.equipment_name}`;
}

/** Same rule as the server for a score without a verdict: ≥ 80 accepted, 60..79 with remarks, below rework. */
function verdictForScore(score: number): Verdict {
  if (score >= 80) return 'accepted';
  if (score >= 60) return 'accepted_with_remarks';
  return 'rework';
}

// ---------------------------------------------------------------------------- return

export function ReturnDialog({ order, onClose }: BaseProps) {
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const caid = useRef(newActionId());
  const { run, pending } = useActionRunner();
  const text = comment.trim();

  const submit = () => {
    setTried(true);
    if (!text) return;
    setError(null);
    run(
      { id: order.id, number: order.number, action: 'return', payload: { comment: text }, clientActionId: caid.current },
      { onSuccess: onClose, onError: (e) => setError(errorText(e)) },
    );
  };

  return (
    <Dialog
      eyebrow={eyebrow(order)}
      title={t('order.return.title')}
      subtitle={t('order.return.hint')}
      onClose={onClose}
      busy={pending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {t('order.dialog.keep')}
          </Button>
          <Button onClick={submit} disabled={pending}>
            {t('action.return')}
          </Button>
        </>
      }
    >
      <Field label={t('order.return.label')}>
        {(id) => (
          <TextArea
            id={id}
            value={comment}
            onChange={setComment}
            placeholder={t('order.return.placeholder')}
            autoFocus
            invalid={tried && !text}
          />
        )}
      </Field>
      {tried && !text ? <FormError>{t('order.return.need')}</FormError> : null}
      {error ? <FormError>{error}</FormError> : null}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------- override and close

interface OverrideProps extends BaseProps {
  review: AiReview | null;
}

export function OverrideDialog({ order, review, onClose }: OverrideProps) {
  const [score, setScore] = useState(review ? String(review.score) : '');
  const [verdict, setVerdict] = useState<Verdict | null>(review?.verdict ?? null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const caid = useRef(newActionId());
  const { run, pending } = useActionRunner();

  const parsed = /^\d{1,3}$/.test(score.trim()) ? Number(score.trim()) : NaN;
  const scoreOk = Number.isInteger(parsed) && parsed >= 0 && parsed <= 100;

  const onScore = (value: string) => {
    setScore(value);
    const n = Number(value);
    if (/^\d{1,3}$/.test(value.trim()) && n >= 0 && n <= 100) setVerdict(verdictForScore(n));
  };

  const submit = () => {
    setTried(true);
    if (!scoreOk || !verdict) return;
    setError(null);
    const note = comment.trim();
    run(
      {
        id: order.id,
        number: order.number,
        action: 'close',
        payload: { final_verdict: verdict, final_score: parsed, ...(note ? { comment: note } : {}) },
        clientActionId: caid.current,
      },
      { onSuccess: onClose, onError: (e) => setError(errorText(e)) },
    );
  };

  return (
    <Dialog
      eyebrow={eyebrow(order)}
      title={review ? t('order.override.title') : t('order.override.title_none')}
      subtitle={
        review
          ? t('order.override.ai', { verdict: VERDICT_LABEL[review.verdict], score: formatScore(review.score) })
          : t('order.override.ai_none')
      }
      onClose={onClose}
      busy={pending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {t('order.dialog.keep')}
          </Button>
          <Button onClick={submit} disabled={pending}>
            {t('order.override.submit')}
          </Button>
        </>
      }
    >
      <Field label={t('order.override.score')}>
        {(id) => (
          <Input
            id={id}
            size="l"
            inputMode="numeric"
            value={score}
            maxLength={3}
            autoFocus
            aria-invalid={tried && !scoreOk ? true : undefined}
            onChange={(e) => onScore(e.target.value.replace(/[^\d]/g, ''))}
          />
        )}
      </Field>
      <div className={styles.group}>
        <span className={styles.groupTitle}>{t('order.override.verdict')}</span>
        <Segmented
          label={t('order.override.verdict')}
          value={verdict ?? ('' as Verdict)}
          onChange={setVerdict}
          options={VERDICTS.map((v) => ({ value: v, label: VERDICT_LABEL[v] }))}
        />
      </div>
      <Field label={t('order.override.comment')}>
        {(id) => (
          <TextArea
            id={id}
            value={comment}
            onChange={setComment}
            rows={3}
            placeholder={t('order.override.comment_placeholder')}
          />
        )}
      </Field>
      {tried && !scoreOk ? <FormError>{t('order.override.bad_score')}</FormError> : null}
      {tried && scoreOk && !verdict ? <FormError>{t('error.MISSING_REASON')}</FormError> : null}
      {error ? <FormError>{error}</FormError> : null}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------- cancel

export function CancelDialog({ order, onClose }: BaseProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const caid = useRef(newActionId());
  const { run, pending } = useActionRunner();
  const text = reason.trim();

  const submit = () => {
    setTried(true);
    if (!text) return;
    setError(null);
    run(
      { id: order.id, number: order.number, action: 'cancel', payload: { reason: text }, clientActionId: caid.current },
      { onSuccess: onClose, onError: (e) => setError(errorText(e)) },
    );
  };

  return (
    <Dialog
      eyebrow={eyebrow(order)}
      title={t('order.cancel.title', { number: order.number })}
      subtitle={t('order.cancel.hint')}
      onClose={onClose}
      busy={pending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {t('order.cancel.keep')}
          </Button>
          <Button variant="danger" onClick={submit} disabled={pending}>
            {t('action.cancel')}
          </Button>
        </>
      }
    >
      <Field label={t('order.cancel.label')}>
        {(id) => (
          <TextArea
            id={id}
            value={reason}
            onChange={setReason}
            rows={3}
            placeholder={t('order.cancel.placeholder')}
            autoFocus
            invalid={tried && !text}
          />
        )}
      </Field>
      {tried && !text ? <FormError>{t('order.cancel.need')}</FormError> : null}
      {error ? <FormError>{error}</FormError> : null}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------- priority

export function PriorityDialog({ order, onClose }: BaseProps) {
  const [priority, setPriority] = useState<Priority>(order.priority);
  const [error, setError] = useState<string | null>(null);
  const caid = useRef(newActionId());
  const { run, pending } = useActionRunner();

  const submit = () => {
    if (priority === order.priority) return;
    setError(null);
    run(
      { id: order.id, number: order.number, action: 'set_priority', payload: { priority }, clientActionId: caid.current },
      {
        success: t('order.done.priority', { priority: PRIORITY_LABEL[priority] }),
        onSuccess: onClose,
        onError: (e) => setError(errorText(e)),
      },
    );
  };

  return (
    <Dialog
      eyebrow={eyebrow(order)}
      title={t('order.priority.title', { number: order.number })}
      subtitle={priority === 'emergency' && order.priority !== 'emergency' ? t('order.priority.emergency_hint') : undefined}
      onClose={onClose}
      busy={pending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {t('order.dialog.keep')}
          </Button>
          <Button onClick={submit} disabled={pending || priority === order.priority}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className={styles.rows} role="radiogroup" aria-label={t('order.f.priority')}>
        {PRIORITIES.map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={priority === p}
            className={styles.row}
            onClick={() => setPriority(p)}
            disabled={pending}
          >
            <span className={styles.rowText}>
              <span className={styles.rowName}>
                <Pill tone={priorityTone(p)}>{PRIORITY_LABEL[p]}</Pill>
              </span>
              {p === order.priority ? <span className={styles.rowSub}>{t('order.priority.current')}</span> : null}
            </span>
            <span className={styles.chevron} aria-hidden="true">
              {priority === p ? '✓' : ''}
            </span>
          </button>
        ))}
      </div>
      {error ? <FormError>{error}</FormError> : null}
    </Dialog>
  );
}
