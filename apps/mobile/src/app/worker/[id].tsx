// One worker, opened from the shift panel (PHASE_0 §7.1): a form sheet on iOS, a modal on Android (root layout).
// Header with the name and the state pill, the «На смене» switch for the master, then the worker's current and
// queued orders (orders.list for the assignee over the active statuses). Natural height content in a ScrollView.
import {
  ACTIVE_STATUSES,
  compareOrders,
  isRotaError,
  workerStateText,
  workerStateTone,
  type OrderFilter,
  type OrderView,
} from '@rota/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { groupHeader, specialtyLine } from '@/features/master/format';
import { LoadError, Loading } from '@/features/master/QueryStates';
import { useNow } from '@/features/master/useNow';
import { goBack } from '@/features/orders/BackBar';
import { orderCardProps, pillTone } from '@/features/orders/present';
import { errorText } from '@/features/orders/useOrderAction';
import { useApi } from '@/lib/api';
import { useDirectories } from '@/lib/directories';
import { haptic } from '@/lib/haptics';
import { t } from '@/lib/i18n';
import { qk } from '@/lib/keys';
import { RoleGate } from '@/lib/roleGate';
import { useTheme } from '@/lib/theme';
import { Banner } from '@/ui/Banner';
import { EmptyState } from '@/ui/EmptyState';
import { ListGroup } from '@/ui/ListGroup';
import { ListRow } from '@/ui/ListRow';
import { OrderCard } from '@/ui/OrderCard';
import { Pill } from '@/ui/Pill';
import { SheetHeader } from '@/ui/SheetHeader';
import { Switch } from '@/ui/Switch';
import { T } from '@/ui/T';

/** Employee ids are uuids; anything else in the URL is not found without asking the server. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function WorkerRoute() {
  return (
    <RoleGate allow={['master']}>
      <WorkerSheet />
    </RoleGate>
  );
}

function WorkerSheet() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const valid = UUID_RE.test(id);
  const api = useApi();
  const theme = useTheme();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const now = useNow();
  const dirs = useDirectories();

  const workers = useQuery({ queryKey: qk.workers, queryFn: () => api.workers.statuses() });
  const w = workers.data?.find((x) => x.id === id);

  const filter: OrderFilter = useMemo(() => ({ assignee_id: id, statuses: [...ACTIVE_STATUSES] }), [id]);
  const orders = useQuery({
    queryKey: qk.ordersList(filter),
    queryFn: () => api.orders.list(filter),
    enabled: valid,
  });

  // The switch flips at once; the server value takes over after the refetch.
  const [shiftPending, setShiftPending] = useState<boolean | null>(null);
  // The HUD sits under a native sheet, so the error shows inline; NETWORK offers «Повторить» with the same value.
  const [shiftError, setShiftError] = useState<{ text: string; retry: boolean | null } | null>(null);
  const onShift = shiftPending ?? w?.on_shift ?? false;

  const setShift = async (next: boolean) => {
    if (!w || shiftPending !== null) return;
    setShiftPending(next);
    setShiftError(null);
    try {
      await api.workers.setOnShift(w.id, next);
      void haptic.light();
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.workers }),
        qc.invalidateQueries({ queryKey: qk.brigades }),
      ]);
    } catch (e) {
      void haptic.error();
      setShiftError({ text: errorText(e), retry: isRotaError(e) && e.code === 'NETWORK' ? next : null });
    } finally {
      setShiftPending(null);
    }
  };

  // From a sheet, an order replaces it: a pushed screen would land under the sheet on iOS.
  const openOrder = (o: OrderView) => router.replace(`/order/${o.id}` as Href);

  const { current, queue } = useMemo(() => {
    const list = [...(orders.data ?? [])].sort(compareOrders);
    return {
      current: list.filter((o) => o.status === 'in_progress'),
      queue: list.filter((o) => o.status !== 'in_progress'),
    };
  }, [orders.data]);

  const brigadeName = w?.brigade_id != null ? dirs.data?.brigades.find((b) => b.id === w.brigade_id)?.name : null;
  const card = (o: OrderView) => (
    <OrderCard
      key={o.id}
      {...orderCardProps(o, { viewer: 'master', now, onPress: () => openOrder(o) })}
      // The assignee is this worker: the name line would only repeat the header.
      person={undefined}
      testID={`worker-order-${o.number}`}
    />
  );

  let body: ReactNode;
  if (workers.isPending) {
    body = <Loading compact />;
  } else if (workers.isError) {
    body = <LoadError compact error={workers.error} onRetry={() => void workers.refetch()} />;
  } else if (!w) {
    body = <EmptyState mascot="oops" mascotSize={96} title={t('master.worker.notFound')} />;
  } else {
    let list: ReactNode;
    if (orders.isPending) {
      list = <Loading compact />;
    } else if (orders.isError) {
      list = <LoadError compact error={orders.error} onRetry={() => void orders.refetch()} />;
    } else if (current.length + queue.length === 0) {
      list = onShift ? (
        <EmptyState mascot="peek" mascotSize={96} title={t('master.worker.empty')} body={t('master.worker.emptyBody')} />
      ) : (
        <EmptyState mascot="sleep" mascotSize={96} title={t('master.worker.offShift')} body={t('master.worker.offBody')} />
      );
    } else {
      list = (
        <>
          {current.length > 0 ? (
            <View style={{ gap: theme.space[3] }}>
              <T variant="monoCaps" tone="secondary" style={{ paddingHorizontal: theme.space[4] }}>
                {t('master.worker.current')}
              </T>
              {current.map(card)}
            </View>
          ) : null}
          {queue.length > 0 ? (
            <View style={{ gap: theme.space[3] }}>
              <T variant="monoCaps" tone="secondary" style={{ paddingHorizontal: theme.space[4] }}>
                {groupHeader(t('master.worker.queue'), queue.length)}
              </T>
              {queue.map(card)}
            </View>
          ) : null}
        </>
      );
    }

    body = (
      <>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: theme.space[2] }}>
          <Pill label={workerStateText(w)} tone={pillTone(workerStateTone(w.status))} />
          {w.status === 'working' && w.current_equipment_name ? (
            <T variant="callout" tone="secondary" numberOfLines={1} style={{ flexShrink: 1 }}>
              {w.current_equipment_name}
            </T>
          ) : null}
        </View>
        <ListGroup>
          <ListRow
            title={onShift ? t('master.worker.onShift') : t('master.worker.offShift')}
            right={
              <Switch
                value={onShift}
                disabled={shiftPending !== null}
                onValueChange={(next) => void setShift(next)}
                accessibilityLabel={t('master.worker.onShift')}
                testID="worker-on-shift"
              />
            }
          />
        </ListGroup>
        {shiftError ? (
          <Banner
            tone="critical"
            text={shiftError.text}
            {...(shiftError.retry !== null
              ? { actionLabel: t('common.retry'), onAction: () => void setShift(shiftError.retry as boolean) }
              : {})}
          />
        ) : null}
        {list}
      </>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.color.bgElevated }}
      contentContainerStyle={{
        // Android shows this route as a full screen modal under the status bar; iOS as a sheet.
        paddingTop: Platform.OS === 'android' ? insets.top : 0,
        paddingBottom: insets.bottom + theme.space[6],
      }}
      showsVerticalScrollIndicator={false}
    >
      <SheetHeader
        title={w?.short_name ?? ''}
        {...(w ? { subtitle: specialtyLine(w, brigadeName) } : {})}
        closeLabel={t('common.close')}
        onClose={goBack}
        showHandle={Platform.OS === 'ios'}
      />
      <View style={{ paddingHorizontal: theme.size.gutter, paddingTop: theme.space[3], gap: theme.space[5] }}>
        {body}
      </View>
    </ScrollView>
  );
}
