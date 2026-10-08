// /board (master, manager): the kanban of CLAUDE.md §6: «Выданы» (with rejected orders and their red badge and a one
// tap «Переназначить»), «Приняты», «В очереди», «В работе» (paused and rework with badges), «Выполнены» (done,
// ai_review, closed today), «Просрочены» (every overdue active order). Glass order cards, the shift counters row,
// filter chips (участок, оборудование, исполнитель, приоритет) kept in the URL. The column is recomputed with the
// client clock (boardColumn, the same rule as v_orders), so a card moves to «Просрочены» the moment its deadline
// passes; live sync refetches on every change.
import {
  BOARD_COLUMN_LABEL,
  BOARD_COLUMNS,
  boardColumn,
  canPerform,
  PRIORITIES,
  PRIORITY_LABEL,
  PRIORITY_RANK,
  type BoardColumn,
  type OrderView,
  type Priority,
  type ReportFilters,
  type Tone,
} from '@rota/shared';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { OrderCard } from '@/components/orders';
import { Button } from '@/components/rota';
import { EmptyState, Page, QueryState, Select, StatusDot } from '@/components/ui';
import { useRequiredSession } from '@/lib/api';
import { useBoard, useDirectories } from '@/lib/queries';
import { paths } from '@/lib/routes';
import { useNow } from '@/lib/useNow';
import { ReassignDialog } from '@/features/orders/ReassignDialog';
import { shiftEyebrow } from '@/features/shift/format';
import { ShiftCounters } from '@/features/shift/ShiftCounters';
import { t } from './strings';
import styles from './board.module.css';

const COLUMN_TONE: Readonly<Record<BoardColumn, Tone>> = {
  issued: 'info',
  accepted: 'info',
  queued: 'queue',
  in_progress: 'working',
  done: 'success',
  overdue: 'critical',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const positiveInt = (v: string | null): number | undefined => {
  if (v == null || !/^\d+$/.test(v)) return undefined;
  const n = Number(v);
  return n > 0 ? n : undefined;
};

interface BoardFilterState {
  filters: ReportFilters;
  priority: Priority | null;
}

/** The board's chips in the URL: area, equipment, assignee (the report filter's names) and priority. */
function useBoardFilters() {
  const [params, setParams] = useSearchParams();
  const state = useMemo<BoardFilterState>(() => {
    const filters: ReportFilters = {};
    const area = positiveInt(params.get('area'));
    const equipment = positiveInt(params.get('equipment'));
    const assignee = params.get('assignee');
    if (area != null) filters.area_id = area;
    if (equipment != null) filters.equipment_id = equipment;
    if (assignee && UUID.test(assignee)) filters.assignee_id = assignee;
    const raw = params.get('priority');
    const priority = raw && (PRIORITIES as readonly string[]).includes(raw) ? (raw as Priority) : null;
    return { filters, priority };
  }, [params]);

  const set = (key: 'area' | 'equipment' | 'assignee' | 'priority', value: string | number | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value == null || value === '') next.delete(key);
        else next.set(key, String(value));
        // a unit of another area would hide everything
        if (key === 'area') next.delete('equipment');
        return next;
      },
      { replace: true },
    );

  const reset = () =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const k of ['area', 'equipment', 'assignee', 'priority']) next.delete(k);
        return next;
      },
      { replace: true },
    );

  const active = Object.keys(state.filters).length > 0 || state.priority != null;
  return { ...state, set, reset, active };
}

/** «Выданы»: rejected first (they wait for the master); «Выполнены»: waiting for the master first, then the most
 *  recently closed; every other column: emergency first, then by deadline. */
function sortColumn(column: BoardColumn, rows: OrderView[]): OrderView[] {
  const byUrgency = (a: OrderView, b: OrderView) =>
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || Date.parse(a.due_at) - Date.parse(b.due_at);
  if (column === 'done') {
    const waiting = (o: OrderView) => (o.status === 'closed' ? 1 : 0);
    const end = (o: OrderView) => Date.parse(o.closed_at ?? o.done_at ?? o.created_at);
    return rows.sort((a, b) => waiting(a) - waiting(b) || end(b) - end(a));
  }
  if (column === 'issued') {
    const rejected = (o: OrderView) => (o.status === 'rejected' ? 0 : 1);
    return rows.sort((a, b) => rejected(a) - rejected(b) || byUrgency(a, b));
  }
  return rows.sort(byUrgency);
}

export function BoardPage() {
  const now = useNow(10_000);
  const session = useRequiredSession();
  const f = useBoardFilters();
  const board = useBoard(f.filters);
  const [reassign, setReassign] = useState<OrderView | null>(null);

  const columns = useMemo(() => {
    const map = new Map<BoardColumn, OrderView[]>(BOARD_COLUMNS.map((c) => [c, []]));
    for (const o of board.data ?? []) {
      if (f.priority && o.priority !== f.priority) continue;
      const col = boardColumn(o, now) ?? o.board_column;
      if (col) map.get(col)?.push(o);
    }
    for (const c of BOARD_COLUMNS) map.set(c, sortColumn(c, map.get(c) ?? []));
    return map;
  }, [board.data, f.priority, now]);
  const shown = [...columns.values()].reduce((n, rows) => n + rows.length, 0);

  return (
    <Page title={t('page.board')} eyebrow={shiftEyebrow(now)}>
      <ShiftCounters now={now} />
      <BoardFilters state={f} />
      <QueryState query={board}>
        {() =>
          shown === 0 ? (
            f.active ? (
              <EmptyState
                mascot="search"
                title={t('board.empty_filtered_title')}
                text={t('board.empty_filtered_text')}
                action={
                  <Button variant="secondary" onClick={f.reset}>
                    {t('board.reset')}
                  </Button>
                }
              />
            ) : (
              <EmptyState mascot="peek" title={t('board.empty_title')} text={t('board.empty_text')} />
            )
          ) : (
            <div className={styles.board} role="list" aria-label={t('board.columns')} data-fetching={board.isFetching || undefined}>
              {BOARD_COLUMNS.map((col) => {
                const rows = columns.get(col) ?? [];
                return (
                  <section
                    key={col}
                    role="listitem"
                    className={styles.column}
                    data-column={col}
                    data-alert={(col === 'overdue' && rows.length > 0) || undefined}
                    aria-label={t('board.column_count', { column: BOARD_COLUMN_LABEL[col], count: rows.length })}
                  >
                    <header className={styles.columnHeader}>
                      <StatusDot tone={COLUMN_TONE[col]} />
                      <h2 className={styles.columnTitle}>{BOARD_COLUMN_LABEL[col]}</h2>
                      <span className={styles.columnCount}>{rows.length}</span>
                    </header>
                    <div className={styles.columnBody}>
                      {rows.length === 0 ? (
                        <p className={styles.columnEmpty}>{t('board.column_empty')}</p>
                      ) : (
                        rows.map((o) => {
                          const oneTap = o.status === 'rejected' && canPerform(o, 'reassign', session);
                          return (
                            <div key={o.id} className={styles.cardWrap} data-attached={oneTap || undefined}>
                              <OrderCard order={o} now={now} to={paths.order(o.id)} />
                              {oneTap ? (
                                <Button className={styles.attached} variant="secondary" onClick={() => setReassign(o)}>
                                  {t('action.reassign')}
                                </Button>
                              ) : null}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          )
        }
      </QueryState>
      {reassign ? <ReassignDialog order={reassign} onClose={() => setReassign(null)} /> : null}
    </Page>
  );
}

// ---------------------------------------------------------------------------- filter chips

function BoardFilters({ state: f }: { state: ReturnType<typeof useBoardFilters> }) {
  const dirs = useDirectories();
  const d = dirs.data;
  const areas = useMemo(() => (d?.areas ?? []).slice().sort((a, b) => a.sort - b.sort), [d]);
  const equipment = useMemo(
    () =>
      (d?.equipment ?? [])
        .filter((e) => f.filters.area_id == null || e.area_id === f.filters.area_id)
        .map((e) => ({ value: String(e.id), label: e.name })),
    [d, f.filters.area_id],
  );
  const workers = useMemo(
    () =>
      (d?.employees ?? [])
        .filter((e) => e.role === 'worker')
        .sort((a, b) => a.short_name.localeCompare(b.short_name, 'ru'))
        .map((e) => ({ value: e.id, label: e.short_name })),
    [d],
  );

  return (
    <div className={styles.filters} role="group" aria-label={t('board.filters')}>
      <div className={styles.chips} role="group" aria-label={t('board.f.area')}>
        <Chip selected={f.filters.area_id == null} onClick={() => f.set('area', null)}>
          {t('board.area_all')}
        </Chip>
        {areas.map((a) => (
          <Chip key={a.id} selected={f.filters.area_id === a.id} onClick={() => f.set('area', a.id)}>
            {a.name}
          </Chip>
        ))}
      </div>
      <div className={styles.chips}>
        <div className={styles.chips} role="group" aria-label={t('board.f.priority')}>
          <Chip selected={f.priority == null} onClick={() => f.set('priority', null)}>
            {t('board.priority_all')}
          </Chip>
          {PRIORITIES.map((p) => (
            <Chip
              key={p}
              selected={f.priority === p}
              critical={p === 'emergency'}
              onClick={() => f.set('priority', f.priority === p ? null : p)}
            >
              {PRIORITY_LABEL[p]}
            </Chip>
          ))}
        </div>
        <Select
          className={styles.select}
          aria-label={t('board.f.equipment')}
          value={f.filters.equipment_id != null ? String(f.filters.equipment_id) : ''}
          placeholder={t('board.equipment_all')}
          options={equipment}
          disabled={!d}
          data-set={f.filters.equipment_id != null || undefined}
          onChange={(e) => f.set('equipment', e.target.value ? Number(e.target.value) : null)}
        />
        <Select
          className={styles.select}
          aria-label={t('board.f.assignee')}
          value={f.filters.assignee_id ?? ''}
          placeholder={t('board.assignee_all')}
          options={workers}
          disabled={!d}
          data-set={f.filters.assignee_id != null || undefined}
          onChange={(e) => f.set('assignee', e.target.value || null)}
        />
        {f.active ? (
          <Button variant="quiet" onClick={f.reset}>
            {t('board.reset')} ✕
          </Button>
        ) : null}
      </div>
    </div>
  );
}

interface ChipProps {
  selected: boolean;
  critical?: boolean;
  onClick: () => void;
  children: string;
}

/** Selectable filter chip: hairline when off, inverse when on; «Аварийный» fills red when on. */
function Chip({ selected, critical, onClick, children }: ChipProps) {
  return (
    <button
      type="button"
      className={styles.chip}
      aria-pressed={selected}
      data-critical={critical || undefined}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
