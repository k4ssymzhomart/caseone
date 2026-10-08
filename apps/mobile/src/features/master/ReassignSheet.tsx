// «Переназначить»: a modal bottom sheet (like ui/ConfirmSheet) for one order (CLAUDE.md §6 reassign, §10).
// Workers tab: the AI's top candidates from suggest_assignees (excluding the current assignee) with an «ИИ» tag
// and their reasons, then every other worker on shift. Brigades tab: v_brigade_status; a brigade order goes to
// its leader on the server. One tap on a row reassigns. preselectId (the escalation url `?reassign=`) highlights
// that worker and offers a one tap «Переназначить на {name}» at the top.
//
// iOS presents one modal at a time from the root, so the sheet closes before the action runs (the HUD and any
// retry sheet of useOrderAction then show above the screen), and the off shift question is asked inside the
// sheet first; the action then goes out with allow_off_shift and the server never raises NOT_ON_SHIFT.
import {
  WORKER_STATE_LABEL,
  workerStateText,
  type ActionPayload,
  type AssigneeSuggestion,
  type BrigadeStatusView,
  type OrderView,
  type WorkerState,
  type WorkerStatusView,
} from '@rota/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { useOrderAction } from '@/features/orders/useOrderAction';
import { useApi } from '@/lib/api';
import { useDirectories } from '@/lib/directories';
import { t } from '@/lib/i18n';
import { qk } from '@/lib/keys';
import { useTheme } from '@/lib/theme';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { ListGroup } from '@/ui/ListGroup';
import { ListRow } from '@/ui/ListRow';
import { Segmented } from '@/ui/Segmented';
import { T } from '@/ui/T';

import { BottomSheet } from './BottomSheet';
import { brigadeCounts, specialtyLine } from './format';
import { LoadError, Loading } from './QueryStates';
import { WorkerRow } from './WorkerRow';

type Tab = 'workers' | 'brigades';

type Target =
  | { kind: 'worker'; id: string; name: string; onShift: boolean }
  | { kind: 'brigade'; id: number; name: string; onShift: boolean };

/** Free first, then queued, then working (the order a master would reach for). */
const STATE_RANK: Record<WorkerState, number> = { free: 0, queue: 1, working: 2, off: 3 };

export interface ReassignSheetProps {
  visible: boolean;
  order: OrderView;
  onClose: () => void;
  /** Employee id proposed by the escalation (`/order/{id}?reassign={candidate_id}`). */
  preselectId?: string | null;
}

export function ReassignSheet({ visible, order, onClose, preselectId }: ReassignSheetProps) {
  const api = useApi();
  const theme = useTheme();
  const { run } = useOrderAction();
  const dirs = useDirectories();
  const [tab, setTab] = useState<Tab>('workers');
  const [ask, setAsk] = useState<Target | null>(null);

  // Every opening starts on the workers tab with no pending question.
  useEffect(() => {
    if (visible) {
      setTab('workers');
      setAsk(null);
    }
  }, [visible]);

  const suggest = useQuery({
    // The exclusion is part of the key: two orders on one unit can have different assignees.
    queryKey: [...qk.suggest(order.equipment_id, null), order.assignee_id],
    queryFn: () => api.orders.suggestAssignees(order.equipment_id, undefined, order.assignee_id),
    enabled: visible,
  });
  const workers = useQuery({ queryKey: qk.workers, queryFn: () => api.workers.statuses(), enabled: visible });
  const brigades = useQuery({ queryKey: qk.brigades, queryFn: () => api.workers.brigades(), enabled: visible });

  const byId = useMemo(() => new Map((workers.data ?? []).map((w) => [w.id, w])), [workers.data]);
  const brigadeName = useMemo(
    () => new Map((dirs.data?.brigades ?? []).map((b) => [b.id, b.name])),
    [dirs.data],
  );

  const suggestions: AssigneeSuggestion[] = useMemo(
    () => (suggest.data ?? []).filter((s) => s.employee_id !== order.assignee_id),
    [suggest.data, order.assignee_id],
  );

  const others: WorkerStatusView[] = useMemo(() => {
    const suggested = new Set(suggestions.map((s) => s.employee_id));
    return (workers.data ?? [])
      .filter((w) => w.on_shift && w.id !== order.assignee_id && !suggested.has(w.id))
      .sort((a, b) => STATE_RANK[a.status] - STATE_RANK[b.status] || a.short_name.localeCompare(b.short_name));
  }, [workers.data, suggestions, order.assignee_id]);

  const preselect: Target | null = useMemo(() => {
    if (!preselectId || preselectId === order.assignee_id) return null;
    const w = byId.get(preselectId);
    const s = suggestions.find((x) => x.employee_id === preselectId);
    const name = w?.short_name ?? s?.short_name;
    if (!name) return null;
    return { kind: 'worker', id: preselectId, name, onShift: w ? w.on_shift : true };
  }, [preselectId, order.assignee_id, byId, suggestions]);

  const go = (target: Target, allowOffShift: boolean) => {
    const payload: ActionPayload =
      target.kind === 'worker' ? { assignee_id: target.id } : { brigade_id: target.id };
    if (allowOffShift) payload.allow_off_shift = true;
    setAsk(null);
    onClose();
    void run(order.id, 'reassign', payload, { success: t('master.reassign.done'), number: order.number });
  };

  const pick = (target: Target) => {
    if (!target.onShift) {
      setAsk(target);
      return;
    }
    go(target, false);
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

  // ---------------------------------------------------------------- pinned top: question, proposal, tabs
  let top: ReactNode;
  if (ask) {
    top = (
      <Card style={{ gap: theme.space[3] }}>
        <T variant="headline">{t('error.NOT_ON_SHIFT', { name: ask.name })}</T>
        <Button label={t('confirm.reassignAnyway')} size="L" full onPress={() => go(ask, true)} />
        <Button label={t('common.cancel')} variant="secondary" size="L" full onPress={() => setAsk(null)} />
      </Card>
    );
  } else {
    top = (
      <>
        {preselectId && preselectId !== order.assignee_id ? (
          <Button
            label={preselect ? t('action.reassign_to', { name: preselect.name }) : t('action.reassign')}
            size="L"
            full
            loading={!preselect && (workers.isPending || suggest.isPending)}
            disabled={!preselect}
            onPress={() => preselect && pick(preselect)}
            testID="reassign-preselect"
          />
        ) : null}
        <Segmented<Tab>
          items={[
            { key: 'workers', label: t('master.reassign.tabWorkers') },
            { key: 'brigades', label: t('master.reassign.tabBrigades') },
          ]}
          value={tab}
          onChange={setTab}
          accessibilityLabel={t('master.reassign.tabs')}
        />
      </>
    );
  }

  // ---------------------------------------------------------------- workers tab
  const stateTextOf = (id: string, fallback: WorkerState): { state: WorkerState; text: string } => {
    const w = byId.get(id);
    return w ? { state: w.status, text: workerStateText(w) } : { state: fallback, text: WORKER_STATE_LABEL[fallback] };
  };

  const workersTab = (
    <>
      <ListGroup header={t('master.reassign.suggested')}>
        {suggest.isPending ? (
          <Loading compact />
        ) : suggest.isError ? (
          <LoadError compact error={suggest.error} onRetry={() => void suggest.refetch()} />
        ) : suggestions.length === 0 ? (
          <ListRow title={t('master.reassign.noSuggestions')} />
        ) : (
          suggestions.map((s) => {
            const st = stateTextOf(s.employee_id, s.status);
            return (
              <WorkerRow
                key={s.employee_id}
                name={s.short_name}
                tag={t('common.ai')}
                subtitle={s.reasons.join(' · ')}
                state={st.state}
                stateText={st.text}
                selected={s.employee_id === preselectId}
                onPress={() => pick(workerTarget(s.employee_id, s.short_name))}
                testID={`reassign-suggest-${s.employee_id}`}
              />
            );
          })
        )}
      </ListGroup>
      <ListGroup header={t('master.reassign.onShift')}>
        {workers.isPending ? (
          <Loading compact />
        ) : workers.isError ? (
          <LoadError compact error={workers.error} onRetry={() => void workers.refetch()} />
        ) : others.length === 0 ? (
          <ListRow title={t('master.reassign.noWorkers')} />
        ) : (
          others.map((w) => (
            <WorkerRow
              key={w.id}
              name={w.short_name}
              subtitle={specialtyLine(w, w.brigade_id != null ? brigadeName.get(w.brigade_id) : null)}
              state={w.status}
              stateText={workerStateText(w)}
              detail={w.status === 'working' ? w.current_equipment_name : null}
              selected={w.id === preselectId}
              onPress={() => pick(workerTarget(w.id, w.short_name))}
              testID={`reassign-worker-${w.tab_no}`}
            />
          ))
        )}
      </ListGroup>
    </>
  );

  // ---------------------------------------------------------------- brigades tab
  const brigadesTab = (
    <ListGroup>
      {brigades.isPending ? (
        <Loading compact />
      ) : brigades.isError ? (
        <LoadError compact error={brigades.error} onRetry={() => void brigades.refetch()} />
      ) : (brigades.data ?? []).length === 0 ? (
        <ListRow title={t('master.reassign.noBrigades')} />
      ) : (
        (brigades.data ?? []).map((b) => {
          const current = order.brigade_id === b.id;
          const leader = b.leader_short_name ? t('master.brigades.leader', { name: b.leader_short_name }) : undefined;
          return (
            <ListRow
              key={b.id}
              title={b.name}
              subtitle={current ? t('master.reassign.currentBrigade') : leader}
              value={brigadeCounts(b)}
              disabled={current}
              onPress={() => pick(brigadeTarget(b))}
              testID={`reassign-brigade-${b.id}`}
            />
          );
        })
      )}
    </ListGroup>
  );

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('master.reassign.title', { number: order.number })}
      subtitle={t('master.reassign.subtitle', { equipment: order.equipment_name, name: order.assignee_short_name })}
      top={top}
    >
      {tab === 'workers' ? workersTab : brigadesTab}
    </BottomSheet>
  );
}
