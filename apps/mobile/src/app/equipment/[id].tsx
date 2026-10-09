// Equipment history (CLAUDE.md §10b, PHASE_0 §7.1): every order on the unit, newest first, with the counters
// нарядов, внеплановых and the total downtime from equipment.history(id). Linked from the order cards.
import { ddmm, formatDuration, isActive, type OrderView } from '@rota/shared';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { LoadError, Loading } from '@/features/master/QueryStates';
import { useNow } from '@/features/master/useNow';
import { orderCardProps } from '@/features/orders/present';
import { useApi } from '@/lib/api';
import { useDirectories } from '@/lib/directories';
import { t } from '@/lib/i18n';
import { qk } from '@/lib/keys';
import { liveHub } from '@/lib/liveHub';
import { RoleGate } from '@/lib/roleGate';
import { useTheme } from '@/lib/theme';
import { Banner } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Counter } from '@/ui/Counter';
import { EmptyState } from '@/ui/EmptyState';
import { OrderCard } from '@/ui/OrderCard';
import { Screen } from '@/ui/Screen';
import { Segmented } from '@/ui/Segmented';
import { T } from '@/ui/T';
import { Tag } from '@/ui/Tag';

type Kind = 'all' | 'unplanned' | 'planned';

/** Cards rendered at first and per «Показать ещё». */
const PAGE = 20;

/** Opened from the master's order screen and the manager's summary. */
export default function EquipmentHistoryRoute() {
  return (
    <RoleGate allow={['master', 'manager']}>
      <EquipmentHistoryScreen />
    </RoleGate>
  );
}

function EquipmentHistoryScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = Number(raw);
  const valid = Number.isInteger(id) && id > 0;
  const api = useApi();
  const theme = useTheme();
  const now = useNow();
  const dirs = useDirectories();
  const [kind, setKind] = useState<Kind>('all');
  const [limit, setLimit] = useState(PAGE);
  const [refreshing, setRefreshing] = useState(false);

  const history = useQuery({
    queryKey: qk.equipment(id),
    queryFn: () => api.equipment.history(id),
    enabled: valid,
  });

  // The header shows from the directories cache before the history arrives.
  const equipment = history.data?.equipment ?? dirs.data?.equipment.find((e) => e.id === id);
  const orders = useMemo(() => history.data?.orders ?? [], [history.data]);
  const areaName =
    (equipment ? dirs.data?.areas.find((a) => a.id === equipment.area_id)?.name : undefined) ?? orders[0]?.area_name;
  const unplanned = orders.filter((o) => o.type === 'unplanned').length;
  const shown = useMemo(
    () => (kind === 'all' ? orders : orders.filter((o) => o.type === kind)),
    [orders, kind],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    liveHub.resync();
    try {
      await history.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [history]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/' as Href));

  const card = (o: OrderView) => {
    const props = orderCardProps(o, { viewer: 'master', now, onPress: () => router.push(`/order/${o.id}` as Href) });
    return (
      <OrderCard
        key={o.id}
        {...props}
        // History reads by date: finished orders show the day they were raised instead of a clock time.
        timeLeft={isActive(o.status) ? props.timeLeft : ddmm(o.created_at)}
        rightTop={o.fault_code ? <Tag label={o.fault_code} /> : undefined}
        testID={`equipment-order-${o.number}`}
      />
    );
  };

  let body: ReactNode;
  if (!valid) {
    body = <EmptyState mascot="oops" title={t('master.equipment.notFound')} />;
  } else if (history.isPending) {
    body = <Loading />;
  } else if (history.isError) {
    body = <LoadError error={history.error} onRetry={() => void history.refetch()} />;
  } else {
    body = (
      <>
        {equipment?.is_stopped ? <Banner tone="critical" text={t('master.equipment.stopped')} /> : null}
        <Card padded={false} style={{ flexDirection: 'row', paddingVertical: theme.space[3], paddingHorizontal: theme.space[2] }}>
          <Counter align="center" style={{ flex: 1 }} value={orders.length} label={t('master.equipment.orders')} />
          <Counter align="center" style={{ flex: 1 }} value={unplanned} label={t('master.equipment.unplanned')} />
          <Counter
            align="center"
            style={{ flex: 1 }}
            value={compactDowntime(history.data.downtime_min)}
            label={t('master.equipment.downtime')}
            bad={equipment?.is_stopped ?? false}
          />
        </Card>
        {orders.length === 0 ? (
          <EmptyState mascot="peek" title={t('master.equipment.empty')} body={t('master.equipment.emptyBody')} />
        ) : (
          <View style={{ gap: theme.space[3] }}>
            <T variant="monoCaps" tone="secondary" style={{ paddingHorizontal: theme.space[4] }}>
              {t('master.equipment.history')}
            </T>
            <Segmented<Kind>
              items={[
                { key: 'all', label: t('master.equipment.filterAll'), count: orders.length },
                { key: 'unplanned', label: t('master.equipment.filterUnplanned'), count: unplanned },
                { key: 'planned', label: t('master.equipment.filterPlanned'), count: orders.length - unplanned },
              ]}
              value={kind}
              onChange={(k) => {
                setKind(k);
                setLimit(PAGE);
              }}
              accessibilityLabel={t('master.equipment.history')}
            />
            {shown.slice(0, limit).map(card)}
            {shown.length > limit ? (
              <Button
                label={t('master.equipment.more')}
                variant="secondary"
                full
                onPress={() => setLimit((n) => n + PAGE)}
              />
            ) : null}
          </View>
        )}
      </>
    );
  }

  return (
    <Screen
      title={equipment?.name ?? ''}
      {...(equipment && areaName
        ? { eyebrow: t('master.equipment.eyebrow', { area: areaName, criticality: equipment.criticality }) }
        : {})}
      right={<Button label={t('common.back')} left="‹" variant="secondary" size="S" onPress={back} />}
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
    >
      <View style={{ gap: theme.space[5] }}>{body}</View>
    </Screen>
  );
}

/** «45 мин» under an hour, whole hours above it («14 ч»): a third of the row cannot fit «14 ч 17 мин» in mono. */
function compactDowntime(minutes: number): string {
  if (minutes < 60) return formatDuration(Math.round(minutes));
  return formatDuration(Math.round(minutes / 60) * 60);
}
