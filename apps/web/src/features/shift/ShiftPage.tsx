// /shift (master, manager): the counters row, workers grouped by state, the live orders list, brigades and the units
// in downtime (PHASE_0 §7.2, PHASE_2 §2.6). Masters toggle a worker's shift here; a click on a name narrows the
// orders list to that worker. Everything refreshes from live sync (['workers'], ['orders'], ['shift'], ['brigades']).
import {
  EQUIPMENT_STOPPED_STATUSES,
  formatDuration,
  isOverdue,
  minutesBetween,
  PRIORITY_RANK,
  workerStateText,
  workerStateTone,
  WORKER_STATES,
  type BrigadeStatusView,
  type OrderView,
  type Status,
  type WorkerState,
  type WorkerStatusView,
} from '@rota/shared';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useHud } from '@/components/HudHost';
import { OrderCard } from '@/components/orders';
import { Button, Switch } from '@/components/rota';
import { Card, EmptyState, Page, Pill, QueryState, Section, Segmented } from '@/components/ui';
import { useRequiredSession } from '@/lib/api';
import { rotaErrorOf, useSetOnShift } from '@/lib/mutations';
import { useBrigadeStatuses, useDirectories, useOrders, useWorkerStatuses } from '@/lib/queries';
import { paths } from '@/lib/routes';
import { useNow } from '@/lib/useNow';
import { initials, shiftEyebrow, specialtyLine } from './format';
import { ShiftCounters } from './ShiftCounters';
import { t } from './strings';
import styles from './shift.module.css';

/** Active orders plus rejected ones: a rejected order waits for the master to reassign it. */
const LIVE_STATUSES: Status[] = ['issued', 'accepted', 'queued', 'in_progress', 'paused', 'rework', 'rejected'];
const LIVE_FILTER = { statuses: LIVE_STATUSES };

type OrdersView = 'all' | 'overdue' | 'emergency' | 'rejected';

const GROUP_KEY: Readonly<Record<WorkerState, 'shift.group.free' | 'shift.group.working' | 'shift.group.queue' | 'shift.group.off'>> = {
  free: 'shift.group.free',
  working: 'shift.group.working',
  queue: 'shift.group.queue',
  off: 'shift.group.off',
};

export function ShiftPage() {
  const now = useNow(15_000);
  const navigate = useNavigate();
  const session = useRequiredSession();
  const canToggle = session.role === 'master' || session.role === 'admin';
  const workers = useWorkerStatuses();
  const orders = useOrders(LIVE_FILTER);
  const [selected, setSelected] = useState<WorkerStatusView | null>(null);

  return (
    <Page
      title={t('page.shift')}
      eyebrow={shiftEyebrow(now)}
      actions={
        <Button variant="secondary" onClick={() => navigate(paths.board)}>
          {t('shift.to_board')}
        </Button>
      }
    >
      <ShiftCounters now={now} />

      <div className={styles.layout}>
        <Section
          title={t('shift.workers')}
          aside={
            workers.data ? (
              <span className={styles.aside}>
                {t('shift.workers_aside', {
                  on: workers.data.filter((w) => w.on_shift).length,
                  total: workers.data.length,
                })}
              </span>
            ) : null
          }
        >
          <QueryState
            query={workers}
            isEmpty={(rows) => rows.length === 0}
            empty={<p className={styles.note}>{t('shift.workers_empty')}</p>}
          >
            {(rows) => (
              <WorkerGroups
                rows={rows}
                canToggle={canToggle}
                selectedId={selected?.id ?? null}
                onSelect={(w) => setSelected((cur) => (cur?.id === w.id ? null : w))}
              />
            )}
          </QueryState>
        </Section>

        <div className={styles.ordersColumn}>
          <LiveOrders
            query={orders}
            now={now}
            selected={selected}
            onClearSelected={() => setSelected(null)}
          />
        </div>
      </div>

      <div className={styles.bottom}>
        <Brigades />
        <StoppedUnits orders={orders.data} now={now} />
      </div>
    </Page>
  );
}

// ---------------------------------------------------------------------------- workers

interface WorkerGroupsProps {
  rows: readonly WorkerStatusView[];
  canToggle: boolean;
  selectedId: string | null;
  onSelect: (w: WorkerStatusView) => void;
}

function WorkerGroups({ rows, canToggle, selectedId, onSelect }: WorkerGroupsProps) {
  const dirs = useDirectories();
  const brigadeName = useMemo(
    () => new Map((dirs.data?.brigades ?? []).map((b) => [b.id, b.name])),
    [dirs.data],
  );
  const groups = WORKER_STATES.map((state) => ({
    state,
    rows: rows
      .filter((w) => w.status === state)
      .slice()
      .sort((a, b) => a.short_name.localeCompare(b.short_name, 'ru')),
  })).filter((g) => g.rows.length > 0);

  return (
    <div className={styles.groups}>
      {groups.map((g) => (
        <div key={g.state} className={styles.group}>
          <h3 className={styles.groupTitle}>{t('shift.group', { label: t(GROUP_KEY[g.state]), count: g.rows.length })}</h3>
          <div className={styles.workerGrid}>
            {g.rows.map((w) => (
              <WorkerCard
                key={w.id}
                worker={w}
                brigade={w.brigade_id != null ? (brigadeName.get(w.brigade_id) ?? null) : null}
                canToggle={canToggle}
                selected={selectedId === w.id}
                onSelect={() => onSelect(w)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface WorkerCardProps {
  worker: WorkerStatusView;
  brigade: string | null;
  canToggle: boolean;
  selected: boolean;
  onSelect: () => void;
}

function WorkerCard({ worker: w, brigade, canToggle, selected, onSelect }: WorkerCardProps) {
  const setOnShift = useSetOnShift();
  const hud = useHud();
  const toggle = (on: boolean) =>
    setOnShift.mutate(
      { employeeId: w.id, onShift: on },
      {
        onSuccess: () =>
          hud.show({ message: t(on ? 'shift.on_shift_done' : 'shift.off_shift_done', { name: w.short_name }) }),
        onError: (e) => hud.show({ message: rotaErrorOf(e)?.message ?? t('error.UNKNOWN'), tone: 'critical' }),
      },
    );
  const pending = setOnShift.isPending;
  const shown = pending && setOnShift.variables ? setOnShift.variables.onShift : w.on_shift;

  return (
    <div className={styles.worker} data-selected={selected || undefined} data-off={w.status === 'off' || undefined}>
      <div className={styles.workerTop}>
        <span className={styles.avatar} aria-hidden="true">
          {initials(w.short_name)}
        </span>
        <div className={styles.workerText}>
          <button
            type="button"
            className={styles.workerName}
            onClick={onSelect}
            aria-pressed={selected}
            aria-label={t('shift.show_orders', { name: w.short_name })}
          >
            {w.short_name}
          </button>
          <span className={styles.workerSub}>{specialtyLine(w, brigade) || w.tab_no}</span>
        </div>
        {canToggle ? (
          <Switch
            checked={shown}
            disabled={pending}
            label={t('shift.on_shift_label', { name: w.short_name })}
            onChange={toggle}
          />
        ) : null}
      </div>
      <div className={styles.workerBottom}>
        <Pill tone={workerStateTone(w.status)}>{workerStateText(w)}</Pill>
        {w.status === 'working' && w.current_order_id != null && w.current_equipment_name ? (
          <Link className={styles.workerLink} to={paths.order(w.current_order_id)}>
            {w.current_equipment_name} ›
          </Link>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------- live orders

interface LiveOrdersProps {
  query: ReturnType<typeof useOrders>;
  now: Date;
  selected: WorkerStatusView | null;
  onClearSelected: () => void;
}

function LiveOrders({ query, now, selected, onClearSelected }: LiveOrdersProps) {
  const [view, setView] = useState<OrdersView>('all');
  const rows = useMemo(() => {
    const all = (query.data ?? []).slice();
    const late = (o: OrderView) => (isOverdue(o, now) ? 0 : 1);
    all.sort(
      (a, b) =>
        late(a) - late(b) ||
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        Date.parse(a.due_at) - Date.parse(b.due_at),
    );
    return all.filter((o) => {
      if (selected && o.assignee_id !== selected.id) return false;
      if (view === 'overdue') return isOverdue(o, now);
      if (view === 'emergency') return o.priority === 'emergency';
      if (view === 'rejected') return o.status === 'rejected';
      return true;
    });
  }, [query.data, now, selected, view]);

  return (
    <Section
      title={selected ? t('shift.orders_of', { name: selected.short_name }) : t('shift.orders')}
      aside={query.data ? <span className={styles.count}>{rows.length}</span> : null}
    >
      <div className={styles.ordersControls}>
        <Segmented
          label={t('shift.orders_filter')}
          value={view}
          onChange={setView}
          options={[
            { value: 'all', label: t('shift.orders.all') },
            { value: 'overdue', label: t('shift.orders.overdue') },
            { value: 'emergency', label: t('shift.orders.emergency') },
            { value: 'rejected', label: t('shift.orders.rejected') },
          ]}
        />
        {selected ? (
          <Button variant="quiet" onClick={onClearSelected}>
            {t('shift.orders_clear')} ✕
          </Button>
        ) : null}
      </div>
      <QueryState
        query={query}
        isEmpty={(data) => data.length === 0}
        empty={
          <EmptyState
            mascot="peek"
            mascotSize={112}
            title={t('shift.orders_empty_title')}
            text={t('shift.orders_empty_text')}
          />
        }
      >
        {() =>
          rows.length === 0 ? (
            <p className={styles.note}>{t('shift.orders_none_filtered')}</p>
          ) : (
            <div className={styles.orderList}>
              {rows.map((o) => (
                <OrderCard key={o.id} order={o} now={now} to={paths.order(o.id)} />
              ))}
            </div>
          )
        }
      </QueryState>
    </Section>
  );
}

// ---------------------------------------------------------------------------- brigades

function brigadeTone(b: BrigadeStatusView) {
  if (b.on_shift_count === 0) return 'off' as const;
  return b.free_count > 0 ? ('free' as const) : ('working' as const);
}

function Brigades() {
  const q = useBrigadeStatuses();
  return (
    <Section title={t('shift.brigades')}>
      <QueryState query={q} isEmpty={(rows) => rows.length === 0} empty={<p className={styles.note}>{t('shift.brigades_empty')}</p>}>
        {(rows) => (
          <div className={styles.brigades}>
            {rows.map((b) => (
              <Card key={b.id}>
                <div className={styles.brigade}>
                  <span className={styles.brigadeName}>{b.name}</span>
                  {b.leader_short_name ? (
                    <span className={styles.workerSub}>{t('shift.brigade_leader', { name: b.leader_short_name })}</span>
                  ) : null}
                  <div className={styles.brigadeBottom}>
                    <Pill tone={brigadeTone(b)}>
                      {b.on_shift_count === 0
                        ? t('shift.brigade_off')
                        : t('shift.brigade_counts', { free: b.free_count, busy: b.busy_count })}
                    </Pill>
                    {b.on_shift_count > 0 ? (
                      <span className={styles.workerSub}>{t('shift.brigade_on', { count: b.on_shift_count })}</span>
                    ) : null}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </QueryState>
    </Section>
  );
}

// ---------------------------------------------------------------------------- units in downtime

interface StoppedUnit {
  equipmentId: number;
  name: string;
  area: string;
  since: string;
  orderId: number;
  number: number;
}

/** Units stopped by an order (the same rule as internal.refresh_equipment), longest downtime first. */
function stoppedUnits(orders: readonly OrderView[]): StoppedUnit[] {
  const stopped = EQUIPMENT_STOPPED_STATUSES as readonly Status[];
  const byUnit = new Map<number, StoppedUnit>();
  for (const o of orders) {
    if (!o.equipment_stopped || !stopped.includes(o.status)) continue;
    const prev = byUnit.get(o.equipment_id);
    if (prev && Date.parse(prev.since) <= Date.parse(o.created_at)) continue;
    byUnit.set(o.equipment_id, {
      equipmentId: o.equipment_id,
      name: o.equipment_name,
      area: o.area_name,
      since: o.created_at,
      orderId: o.id,
      number: o.number,
    });
  }
  return [...byUnit.values()].sort((a, b) => Date.parse(a.since) - Date.parse(b.since));
}

function StoppedUnits({ orders, now }: { orders: readonly OrderView[] | undefined; now: Date }) {
  const units = useMemo(() => stoppedUnits(orders ?? []), [orders]);
  return (
    <Section title={t('shift.stopped')} aside={orders ? <span className={styles.count}>{units.length}</span> : null}>
      {orders === undefined ? null : units.length === 0 ? (
        <p className={styles.note}>{t('shift.stopped_none')}</p>
      ) : (
        <div className={styles.units}>
          {units.map((u) => (
            <Card key={u.equipmentId} pad="none">
              <div className={styles.unit}>
                <div className={styles.unitText}>
                  <Link className={styles.unitName} to={paths.equipment(u.equipmentId)}>
                    {u.name} ›
                  </Link>
                  <span className={styles.workerSub}>{u.area}</span>
                </div>
                <div className={styles.unitRight}>
                  <Pill tone="critical">
                    {t('shift.stopped_for', { duration: formatDuration(minutesBetween(u.since, now)) })}
                  </Pill>
                  <Link className={styles.workerLink} to={paths.order(u.orderId)}>
                    {t('shift.stopped_order', { number: u.number })}
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Section>
  );
}
