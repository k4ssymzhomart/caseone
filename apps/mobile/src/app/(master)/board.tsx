// «Доска»: every live order of the shop by the CLAUDE.md §6 board map (PHASE_0 §7.1, PHASE_2 §2.3).
// orders.forBoard() once, grouped on the client into the six columns; the filter chips narrow it client side.
// A card moves into «Просрочены» the moment its deadline passes (local clock check on top of the server's flag).
// Rejected cards carry a one tap «Переназначить».
import {
  BOARD_COLUMNS,
  BOARD_COLUMN_LABEL,
  boardColumn,
  compareOrders,
  type BoardColumn,
  type OrderView,
} from '@rota/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import {
  BoardFilters,
  EMPTY_BOARD_FILTERS,
  applyBoardFilters,
  hasBoardFilters,
  type BoardFilterState,
} from '@/features/master/BoardFilters';
import { shiftEyebrow } from '@/features/master/format';
import { LoadError, Loading } from '@/features/master/QueryStates';
import { ReassignSheet } from '@/features/master/ReassignSheet';
import { ShiftCounters } from '@/features/master/ShiftCounters';
import { useNow } from '@/features/master/useNow';
import { orderCardProps } from '@/features/orders/present';
import { useOrderAction } from '@/features/orders/useOrderAction';
import { useApi } from '@/lib/api';
import { useDirectories } from '@/lib/directories';
import { t } from '@/lib/i18n';
import { qk } from '@/lib/keys';
import { liveHub } from '@/lib/liveHub';
import { useTheme } from '@/lib/theme';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { OrderCard } from '@/ui/OrderCard';
import { Screen } from '@/ui/Screen';
import { Segmented } from '@/ui/Segmented';
import { useTabBarHeight } from '@/ui/TabBar';

function isBoardColumn(v: unknown): v is BoardColumn {
  return typeof v === 'string' && (BOARD_COLUMNS as readonly string[]).includes(v);
}

/** Overdue if the server or the local clock says so; otherwise the server's column. */
function columnOf(o: OrderView, now: Date): BoardColumn | null {
  return boardColumn(o, now) === 'overdue' ? 'overdue' : o.board_column;
}

/** In «Выполнены» the orders waiting for the master come first. */
function compareInColumn(column: BoardColumn) {
  return (a: OrderView, b: OrderView) => {
    if (column === 'done') {
      const wa = a.status === 'ai_review' ? 0 : 1;
      const wb = b.status === 'ai_review' ? 0 : 1;
      if (wa !== wb) return wa - wb;
    }
    return compareOrders(a, b);
  };
}

export default function BoardScreen() {
  const api = useApi();
  const theme = useTheme();
  const qc = useQueryClient();
  const tabBar = useTabBarHeight();
  const now = useNow(10_000);
  const dirs = useDirectories();
  const params = useLocalSearchParams<{ column?: string; at?: string }>();

  const [column, setColumn] = useState<BoardColumn>(isBoardColumn(params.column) ? params.column : 'issued');
  const [filters, setFilters] = useState<BoardFilterState>(EMPTY_BOARD_FILTERS);
  const [refreshing, setRefreshing] = useState(false);
  const [reassignOrder, setReassignOrder] = useState<OrderView | null>(null);
  const [reassignOpen, setReassignOpen] = useState(false);
  // One mutation hook for the board: the reassign of a rejected card shows its spinner on that card's button.
  const { run, pending } = useOrderAction();
  const reassigning = pending === 'reassign';

  // The shift panel opens a column with `/board?column=overdue&at=…` (at makes a repeated tap count).
  useEffect(() => {
    if (isBoardColumn(params.column)) setColumn(params.column);
  }, [params.column, params.at]);

  const board = useQuery({ queryKey: qk.board({}), queryFn: () => api.orders.forBoard() });

  const columns = useMemo(() => {
    const by = new Map<BoardColumn, OrderView[]>(BOARD_COLUMNS.map((c) => [c, []]));
    for (const o of applyBoardFilters(board.data ?? [], filters)) {
      const c = columnOf(o, now);
      if (c) by.get(c)?.push(o);
    }
    for (const [c, list] of by) list.sort(compareInColumn(c));
    return by;
  }, [board.data, filters, now]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    liveHub.resync();
    try {
      await Promise.all([qc.invalidateQueries({ queryKey: qk.orders }), qc.invalidateQueries({ queryKey: qk.shift })]);
    } finally {
      setRefreshing(false);
    }
  }, [qc]);

  const openReassign = (o: OrderView) => {
    setReassignOrder(o);
    setReassignOpen(true);
  };

  // Until the master picks a column, open on the first one that has cards (overdue first: it needs action).
  const [picked, setPicked] = useState(isBoardColumn(params.column));
  useEffect(() => {
    if (picked || !board.data) return;
    const order: BoardColumn[] = ['overdue', ...BOARD_COLUMNS.filter((c) => c !== 'overdue')];
    const first = order.find((c) => (columns.get(c)?.length ?? 0) > 0);
    if (first) setColumn(first);
    setPicked(true);
  }, [picked, board.data, columns]);

  const filtered = hasBoardFilters(filters);
  const list = columns.get(column) ?? [];

  let body: ReactNode;
  if (board.isPending) {
    body = <Loading />;
  } else if (board.isError) {
    body = <LoadError error={board.error} onRetry={() => void board.refetch()} />;
  } else if (list.length === 0) {
    body = (
      <EmptyState
        mascot="peek"
        title={t(`master.board.empty.${column}`)}
        body={filtered ? t('master.board.empty.filtered') : t('master.board.empty.body')}
        action={
          filtered ? (
            <Button
              label={t('master.board.empty.resetFilters')}
              variant="secondary"
              onPress={() => setFilters(EMPTY_BOARD_FILTERS)}
            />
          ) : undefined
        }
      />
    );
  } else {
    body = list.map((o) => (
      <View key={o.id} style={{ gap: theme.space[2] }}>
        <OrderCard
          {...orderCardProps(o, { viewer: 'master', now, onPress: () => router.push(`/order/${o.id}` as Href) })}
          testID={`board-order-${o.number}`}
        />
        {o.status === 'rejected' ? (
          <Button
            label={t('action.reassign')}
            variant="secondary"
            full
            loading={reassigning && reassignOrder?.id === o.id}
            disabled={reassigning}
            onPress={() => openReassign(o)}
            testID={`board-reassign-${o.number}`}
          />
        ) : null}
      </View>
    ));
  }

  return (
    <Screen
      title={t('master.board.title')}
      eyebrow={shiftEyebrow(now)}
      insetBottom={false}
      bottomPadding={tabBar}
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
    >
      <View style={{ gap: theme.space[4] }}>
        <ShiftCounters now={now} onOverduePress={() => setColumn('overdue')} />
        <BoardFilters value={filters} onChange={setFilters} orders={board.data ?? []} directories={dirs.data} />
        <Segmented<BoardColumn>
          scrollable
          items={BOARD_COLUMNS.map((c) => {
            const count = columns.get(c)?.length ?? 0;
            return {
              key: c,
              label: BOARD_COLUMN_LABEL[c],
              count,
              tone: c === 'overdue' && count > 0 ? ('critical' as const) : ('default' as const),
            };
          })}
          value={column}
          onChange={(c) => {
            setPicked(true);
            setColumn(c);
          }}
          accessibilityLabel={t('master.board.columns')}
        />
        <View style={{ gap: theme.space[3] }}>{body}</View>
      </View>
      {reassignOrder ? (
        <ReassignSheet
          visible={reassignOpen}
          order={reassignOrder}
          onClose={() => setReassignOpen(false)}
          run={run}
        />
      ) : null}
    </Screen>
  );
}
