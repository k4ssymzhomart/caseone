// «Закрытые» (case 5.3.4, PHASE_2 §2.3): the worker's closed orders of the last 30 days, newest first,
// each with the final verdict and score in the badge («Принято · 87»), plus the count and the mean score.
import { formatNumber, type OrderFilter, type Session } from '@rota/shared';
import { Redirect, type Href } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';

import { OrderSection } from '@/features/orders/OrderSection';
import { ErrorView, LoadingView } from '@/features/orders/StateViews';
import { useNow } from '@/features/orders/useNow';
import { useApi, useSession } from '@/lib/api';
import { t } from '@/lib/i18n';
import { qk } from '@/lib/keys';
import { useTheme } from '@/lib/theme';
import { Card } from '@/ui/Card';
import { Counter } from '@/ui/Counter';
import { EmptyState } from '@/ui/EmptyState';
import { Screen } from '@/ui/Screen';
import { useTabBarHeight } from '@/ui/TabBar';

const PERIOD_DAYS = 30;
const DAY_MS = 24 * 60 * 60_000;

export default function WorkerClosed() {
  // Sign out clears the session before the tabs unmount: redirect then instead of throwing.
  const session = useSession();
  if (!session) return <Redirect href={'/' as Href} />;
  return <WorkerClosedBody session={session} />;
}

function WorkerClosedBody({ session }: { session: Session }) {
  const api = useApi();
  const theme = useTheme();
  const now = useNow(60_000);
  const tabBar = useTabBarHeight();
  const me = session.user_id;

  // Fixed per mount, so the query key stays stable while the screen is open.
  const [since] = useState(() => new Date(Date.now() - PERIOD_DAYS * DAY_MS).toISOString());
  const filter = useMemo<OrderFilter>(() => ({ assignee_id: me, statuses: ['closed'], since }), [me, since]);
  const query = useQuery({ queryKey: qk.ordersList(filter), queryFn: () => api.orders.list(filter) });

  const closed = useMemo(
    () =>
      [...(query.data ?? [])].sort(
        (a, b) => Date.parse(b.closed_at ?? b.created_at) - Date.parse(a.closed_at ?? a.created_at),
      ),
    [query.data],
  );
  const scores = closed.map((o) => o.final_score).filter((s): s is number => s !== null);
  const average = scores.length > 0 ? scores.reduce((sum, s) => sum + s, 0) / scores.length : null;

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    api.realtime.resync();
    try {
      await query.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [api, query]);

  let content;
  if (query.data === undefined) {
    content = query.isError ? (
      <ErrorView title={t('worker.closed.error')} error={query.error} onRetry={() => void query.refetch()} />
    ) : (
      <LoadingView />
    );
  } else if (closed.length === 0) {
    content = (
      <EmptyState mascot="peek" title={t('worker.closed.empty.title')} body={t('worker.closed.empty.body')} />
    );
  } else {
    content = (
      <View style={{ gap: theme.space[6] }}>
        <Card style={{ flexDirection: 'row', gap: theme.space[4] }}>
          <Counter value={closed.length} label={t('worker.closed.count')} style={{ flex: 1 }} />
          <Counter
            value={average !== null ? formatNumber(average, 0) : '…'}
            label={t('worker.closed.avg')}
            style={{ flex: 1 }}
          />
        </Card>
        <OrderSection orders={closed} now={now} viewer="worker" testID="closed-list" />
      </View>
    );
  }

  return (
    <Screen
      title={t('worker.closed.title')}
      eyebrow={t('worker.closed.eyebrow')}
      bottomPadding={tabBar}
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
      testID="worker-closed"
    >
      {content}
    </Screen>
  );
}
