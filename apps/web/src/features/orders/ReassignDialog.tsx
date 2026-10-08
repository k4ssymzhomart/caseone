// «Переназначить» (CLAUDE.md §6 reassign, §10): the workers tab shows the AI's top candidates from suggest_assignees
// (the current assignee excluded) with the «ИИ» tag and their reasons, then every other worker on shift (free, then
// queued, then working), then, on request, the workers off shift. The brigades tab lists v_brigade_status; a brigade
// order goes to its leader on the server. One click reassigns; a worker off shift is asked about first and the
// action then goes out with allow_off_shift. Used by /orders/:id and by the one tap «Переназначить» on /board.
import {
  workerStateText,
  workerStateTone,
  type ActionPayload,
  type AssigneeSuggestion,
  type BrigadeStatusView,
  type OrderView,
  type WorkerState,
  type WorkerStatusView,
} from '@rota/shared';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/rota';
import { FormError, Loading, Pill, Segmented, Tag } from '@/components/ui';
import { newActionId } from '@/lib/api';
import { useBrigadeStatuses, useDirectories, useSuggestAssignees, useWorkerStatuses } from '@/lib/queries';
import { initials, specialtyLine } from '@/features/shift/format';
import { Dialog } from './Dialog';
import { t } from './strings';
import { errorText, useActionRunner } from './useActionRunner';
import styles from './reassign.module.css';

export type ReassignOrder = Pick<
  OrderView,
  'id' | 'number' | 'equipment_id' | 'equipment_name' | 'assignee_id' | 'assignee_short_name' | 'brigade_id'
>;

type Tab = 'workers' | 'brigades';

type Target =
  | { kind: 'worker'; id: string; name: string; onShift: boolean }
  | { kind: 'brigade'; id: number; name: string; onShift: boolean };

/** Free first, then queued, then working: the order a master reaches for. */
const STATE_RANK: Readonly<Record<WorkerState, number>> = { free: 0, queue: 1, working: 2, off: 3 };

interface ReassignDialogProps {
  order: ReassignOrder;
  onClose: () => void;
  onDone?: () => void;
}

export function ReassignDialog({ order, onClose, onDone }: ReassignDialogProps) {
  const [tab, setTab] = useState<Tab>('workers');
  const [ask, setAsk] = useState<Target | null>(null);
  const [showOff, setShowOff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const caid = useRef(newActionId());
  const { run, pending } = useActionRunner();

  const suggest = useSuggestAssignees(order.equipment_id, undefined, order.assignee_id);
  const workers = useWorkerStatuses();
  const brigades = useBrigadeStatuses();
  const dirs = useDirectories();

  const byId = useMemo(() => new Map((workers.data ?? []).map((w) => [w.id, w])), [workers.data]);
  const brigadeName = useMemo(
    () => new Map((dirs.data?.brigades ?? []).map((b) => [b.id, b.name])),
    [dirs.data],
  );
  const suggestions: AssigneeSuggestion[] = useMemo(
    () => (suggest.data ?? []).filter((s) => s.employee_id !== order.assignee_id),
    [suggest.data, order.assignee_id],
  );
  const { onShift, offShift } = useMemo(() => {
    const suggested = new Set(suggestions.map((s) => s.employee_id));
    const rest = (workers.data ?? [])
      .filter((w) => w.id !== order.assignee_id && !suggested.has(w.id))
      .sort((a, b) => STATE_RANK[a.status] - STATE_RANK[b.status] || a.short_name.localeCompare(b.short_name, 'ru'));
    return { onShift: rest.filter((w) => w.on_shift), offShift: rest.filter((w) => !w.on_shift) };
  }, [workers.data, suggestions, order.assignee_id]);

  const go = (target: Target, allowOffShift: boolean) => {
    const payload: ActionPayload = target.kind === 'worker' ? { assignee_id: target.id } : { brigade_id: target.id };
    if (allowOffShift) payload.allow_off_shift = true;
    setError(null);
    run(
      { id: order.id, number: order.number, action: 'reassign', payload, clientActionId: caid.current },
      {
        success: t('order.done.reassigned', { name: target.name }),
        onSuccess: () => {
          onDone?.();
          onClose();
        },
        onError: (e) => {
          if (e?.code === 'NOT_ON_SHIFT') {
            setAsk(target);
            return;
          }
          setAsk(null);
          setError(errorText(e));
        },
      },
    );
  };

  const pick = (target: Target) => {
    if (pending) return;
    if (!target.onShift) setAsk(target);
    else go(target, false);
  };

  const workerTarget = (id: string, name: string): Target => ({
    kind: 'worker',
    id,
    name,
    onShift: byId.get(id)?.on_shift ?? true,
  });
  const brigadeTarget = (b: BrigadeStatusView): Target => {
    const leader = b.leader_id ? byId.get(b.leader_id) : undefined;
    return { kind: 'brigade', id: b.id, name: b.name, onShift: leader ? leader.on_shift : b.on_shift_count > 0 };
  };

  return (
    <Dialog
      size="l"
      eyebrow={t('action.reassign')}
      title={t('order.reassign.title', { number: order.number })}
      subtitle={t('order.reassign.subtitle', { equipment: order.equipment_name, name: order.assignee_short_name })}
      onClose={onClose}
      busy={pending}
    >
      {ask ? (
        <div className={styles.ask} role="alertdialog" aria-label={t('error.NOT_ON_SHIFT', { name: ask.name })}>
          <p className={styles.askText}>{t('error.NOT_ON_SHIFT', { name: ask.name })}</p>
          <div className={styles.askButtons}>
            <Button onClick={() => go(ask, true)} disabled={pending}>
              {t('order.reassign.anyway')}
            </Button>
            <Button variant="secondary" onClick={() => setAsk(null)} disabled={pending}>
              {t('order.dialog.keep')}
            </Button>
          </div>
        </div>
      ) : null}
      {error ? <FormError>{error}</FormError> : null}

      <Segmented
        label={t('order.reassign.tabs')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'workers', label: t('order.reassign.workers') },
          { value: 'brigades', label: t('order.reassign.brigades') },
        ]}
      />

      {tab === 'workers' ? (
        <>
          <Group title={t('order.reassign.suggested')}>
            {suggest.isPending ? (
              <Loading />
            ) : suggestions.length === 0 ? (
              <p className={styles.note}>{t('order.reassign.no_suggestions')}</p>
            ) : (
              suggestions.map((s) => (
                <Row
                  key={s.employee_id}
                  name={s.short_name}
                  tag={t('order.reassign.ai')}
                  sub={s.reasons.join(' · ')}
                  right={<Pill tone={workerStateTone(s.status)}>{stateText(byId.get(s.employee_id), s.status)}</Pill>}
                  disabled={pending}
                  onClick={() => pick(workerTarget(s.employee_id, s.short_name))}
                />
              ))
            )}
          </Group>
          <Group title={t('order.reassign.on_shift')}>
            {workers.isPending ? (
              <Loading />
            ) : onShift.length === 0 ? (
              <p className={styles.note}>{t('order.reassign.no_workers')}</p>
            ) : (
              onShift.map((w) => (
                <WorkerRow key={w.id} w={w} brigade={brigadeName} disabled={pending} onClick={() => pick(workerTarget(w.id, w.short_name))} />
              ))
            )}
          </Group>
          {offShift.length > 0 ? (
            <div className={styles.group}>
              <Button variant="quiet" onClick={() => setShowOff((v) => !v)}>
                {showOff ? t('order.reassign.hide_off') : t('order.reassign.show_off', { count: offShift.length })}
              </Button>
              {showOff ? (
                <div className={styles.rows}>
                  {offShift.map((w) => (
                    <WorkerRow key={w.id} w={w} brigade={brigadeName} disabled={pending} onClick={() => pick(workerTarget(w.id, w.short_name))} />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <Group>
          {brigades.isPending ? (
            <Loading />
          ) : (brigades.data ?? []).length === 0 ? (
            <p className={styles.note}>{t('order.reassign.no_brigades')}</p>
          ) : (
            (brigades.data ?? []).map((b) => {
              const current = order.brigade_id === b.id;
              return (
                <Row
                  key={b.id}
                  name={b.name}
                  sub={
                    current
                      ? t('order.reassign.current_brigade')
                      : b.leader_short_name
                        ? t('order.reassign.leader', { name: b.leader_short_name })
                        : t('order.reassign.no_leader')
                  }
                  right={
                    <Pill tone={b.on_shift_count === 0 ? 'off' : b.free_count > 0 ? 'free' : 'working'}>
                      {b.on_shift_count === 0
                        ? t('order.reassign.off_shift')
                        : t('order.reassign.counts', { free: b.free_count, busy: b.busy_count })}
                    </Pill>
                  }
                  disabled={pending || current || !b.leader_id}
                  onClick={() => pick(brigadeTarget(b))}
                />
              );
            })
          )}
        </Group>
      )}
    </Dialog>
  );
}

function stateText(w: WorkerStatusView | undefined, fallback: WorkerState): string {
  return w ? workerStateText(w) : workerStateText({ status: fallback });
}

function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className={styles.group}>
      {title ? <h3 className={styles.groupTitle}>{title}</h3> : null}
      <div className={styles.rows}>{children}</div>
    </div>
  );
}

interface RowProps {
  name: string;
  tag?: string;
  sub?: string;
  right?: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}

function Row({ name, tag, sub, right, disabled, onClick }: RowProps) {
  return (
    <button type="button" className={styles.row} onClick={onClick} disabled={disabled}>
      <span className={styles.avatar} aria-hidden="true">
        {initials(name)}
      </span>
      <span className={styles.rowText}>
        <span className={styles.rowName}>
          {name}
          {tag ? <Tag>{tag}</Tag> : null}
        </span>
        {sub ? <span className={styles.rowSub}>{sub}</span> : null}
      </span>
      {right}
      <span className={styles.chevron} aria-hidden="true">
        ›
      </span>
    </button>
  );
}

function WorkerRow({
  w,
  brigade,
  disabled,
  onClick,
}: {
  w: WorkerStatusView;
  brigade: ReadonlyMap<number, string>;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Row
      name={w.short_name}
      sub={specialtyLine(w, w.brigade_id != null ? brigade.get(w.brigade_id) : null)}
      right={<Pill tone={workerStateTone(w.status)}>{workerStateText(w)}</Pill>}
      disabled={disabled}
      onClick={onClick}
    />
  );
}
