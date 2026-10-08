// «Мои наряды» (PHASE_0 §7.1, PHASE_2 §2.3): the shift eyebrow, the «На смене» switch and the worker's
// active orders in three sections: «Аварийные», «В работе», «Очередь» (queued by queue_position).
import {
  ACTIVE_STATUSES,
  hhmm,
  shiftEnd,
  shiftOf,
  shiftStart,
  workerStateText,
  type OrderFilter,
  type Session,
  type Status,
} from '@rota/shared';
import { Redirect, type Href } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';

import { OrderSection } from '@/features/orders/OrderSection';
import { splitWorkerOrders } from '@/features/orders/workerSections';
import { ErrorView, LoadingView } from '@/features/orders/StateViews';
import { useNow } from '@/features/orders/useNow';
import { showErrorHud } from '@/features/orders/useOrderAction';
import { useApi, useSession } from '@/lib/api';
import { useDirectories } from '@/lib/directories';
import { haptic } from '@/lib/haptics';
import { t } from '@/lib/i18n';
import { qk } from '@/lib/keys';
import { liveHub } from '@/lib/liveHub';
import { useTheme } from '@/lib/theme';
import { EmptyState } from '@/ui/EmptyState';
import { useHud } from '@/ui/Hud';
import { ListGroup } from '@/ui/ListGroup';
import { ListRow } from '@/ui/ListRow';
import { Screen } from '@/ui/Screen';
import { Switch } from '@/ui/Switch';
import { useTabBarHeight } from '@/ui/TabBar';

export default function WorkerHome() {
  // Sign out clears the session before the tabs unmount: redirect then instead of throwing.
  const session = useSession();
  if (!session) return <Redirect href={'/' as Href} />;
  return <WorkerHomeBody session={session} />;
}

function WorkerHomeBody({ session }: { session: Session }) {
  const api = useApi();
  const theme = useTheme();
  const hud = useHud();
  const qc = useQueryClient();
  const now = useNow();
  const tabBar = useTabBarHeight();
  const me = session.user_id;

  const filter = useMemo<OrderFilter>(() => ({ assignee_id: me, statuses: [...ACTIVE_STATUSES] as Status[] }), [me]);
  const orders = useQuery({ queryKey: qk.ordersList(filter), queryFn: () => api.orders.list(filter) });
  const workers = useQuery({ queryKey: qk.workers, queryFn: () => api.workers.statuses() });
  const dirs = useDirectories();

  // On shift: my v_worker_status row (live), else what I set last, else the directory snapshot.
  const meRow = workers.data?.find((w) => w.id === me);
  const [pendingShift, setPendingShift] = useState<boolean | null>(null);
  const [lastSet, setLastSet] = useState<boolean | null>(null);
  const onShift =
    pendingShift ?? meRow?.on_shift ?? lastSet ?? dirs.data?.employees.find((e) => e.id === me)?.on_shift ?? false;

  const toggleShift = async (next: boolean) => {
    if (pendingShift !== null) return;
    setPendingShift(next);
    try {
      await api.workers.setOnShift(me, next);
      setLastSet(next);
      await qc.invalidateQueries({ queryKey: qk.workers });
      void haptic.light();
      hud.show({ message: t(next ? 'worker.home.onShiftHud' : 'worker.home.offShiftHud') });
    } catch (e) {
      void haptic.error();
      showErrorHud(hud, e, () => void toggleShift(next));
    } finally {
      setPendingShift(null);
    }
  };

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    liveHub.resync();
    try {
      await Promise.all([orders.refetch(), workers.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }, [orders, workers]);

  const shift = shiftOf(now);
  const eyebrow = t('worker.home.eyebrow', {
    shift: t(shift === 'day' ? 'worker.shift.day' : 'worker.shift.night'),
    from: hhmm(shiftStart(now)),
    to: hhmm(shiftEnd(now)),
  });

  const sections = useMemo(() => splitWorkerOrders(orders.data ?? []), [orders.data]);
  const empty = orders.data !== undefined && orders.data.length === 0;

  let content;
  if (orders.data === undefined) {
    content = orders.isError ? (
      <ErrorView title={t('worker.home.error')} error={orders.error} onRetry={() => void orders.refetch()} />
    ) : (
      <LoadingView />
    );
  } else if (empty) {
    content = onShift ? (
      <EmptyState mascot="peek" title={t('worker.home.empty.title')} body={t('worker.home.empty.body')} />
    ) : (
      <EmptyState mascot="sleep" title={t('worker.home.off.title')} body={t('worker.home.off.body')} />
    );
  } else {
    content = (
      <View style={{ gap: theme.space[8] }}>
        <OrderSection
          title={t('worker.home.section.emergency')}
          orders={sections.emergency}
          now={now}
          viewer="worker"
          critical
          testID="section-emergency"
        />
        <OrderSection
          title={t('worker.home.section.active')}
          orders={sections.working}
          now={now}
          viewer="worker"
          testID="section-working"
        />
        <OrderSection
          title={t('worker.home.section.queue')}
          orders={sections.queue}
          now={now}
          viewer="worker"
          testID="section-queue"
        />
      </View>
    );
  }

  return (
    <Screen
      title={t('worker.home.title')}
      eyebrow={eyebrow}
      bottomPadding={tabBar}
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
      testID="worker-home"
    >
      <ListGroup style={{ marginBottom: theme.space[8] }}>
        <ListRow
          density="worker"
          title={t('worker.home.onShift')}
          {...(meRow ? { subtitle: workerStateText(meRow) } : {})}
          onPress={() => void toggleShift(!onShift)}
          disabled={pendingShift !== null}
          right={
            <Switch
              value={onShift}
              onValueChange={(v) => void toggleShift(v)}
              disabled={pendingShift !== null}
              accessibilityLabel={t('worker.home.onShift')}
              testID="on-shift-switch"
            />
          }
          accessibilityLabel={t('worker.home.onShift')}
        />
      </ListGroup>
      {content}
    </Screen>
  );
}
