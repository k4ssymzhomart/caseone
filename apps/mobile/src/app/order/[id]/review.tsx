// Order report after the AI check (PHASE_0 §7.1 review, CLAUDE.md §12, PHASE_2 §2.3).
// Waits for the review of the current attempt (status ai_review and no review for rework_count + 1): the order
// query refetches on realtime and polls every 2 s meanwhile. Workers get their report, staff the master view.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { MasterReview } from '@/features/review/MasterReview';
import { ReviewWaiting } from '@/features/review/ReviewWaiting';
import { TopBar } from '@/features/review/TopBar';
import { WorkerReview } from '@/features/review/WorkerReview';
import { isWaiting, shownReview } from '@/features/review/checks';
import { errorText } from '@/features/orders/useOrderAction';
import { orderEyebrow } from '@/features/orders/present';
import { useApi, useSession } from '@/lib/api';
import { useDirectories } from '@/lib/directories';
import { t } from '@/lib/i18n';
import { qk } from '@/lib/keys';
import { useTheme } from '@/lib/theme';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { useHud } from '@/ui/Hud';
import { Screen } from '@/ui/Screen';

const POLL_MS = 2000;
/** A review created this recently counts as just arrived (haptic once). */
const FRESH_MS = 60_000;

export default function ReviewScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = Number(raw);
  const valid = Number.isFinite(id) && id > 0;
  const api = useApi();
  const qc = useQueryClient();
  const hud = useHud();
  const theme = useTheme();
  const session = useSession();
  const dirs = useDirectories();
  const [retrying, setRetrying] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const q = useQuery({
    queryKey: qk.order(id),
    queryFn: () => api.orders.get(id),
    enabled: valid,
    refetchInterval: (query) => (isWaiting(query.state.data) ? POLL_MS : false),
  });

  const detail = q.data;
  const waiting = isWaiting(detail);
  const review = detail && !waiting ? shownReview(detail) : null;

  // Remember that this screen saw the wait, so the verdict that follows counts as just arrived.
  const [sawWaiting, setSawWaiting] = useState(false);
  if (waiting && !sawWaiting) setSawWaiting(true);

  if (!session) return <Redirect href="/" />;

  const refresh = async () => {
    setRefreshing(true);
    try {
      await q.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const retry = async () => {
    setRetrying(true);
    try {
      await api.ai.verify(id);
    } catch (e) {
      hud.show({ message: errorText(e), tone: 'critical' });
    } finally {
      setRetrying(false);
      void qc.invalidateQueries({ queryKey: qk.order(id) });
    }
  };

  if (!valid || q.isError || dirs.isError) {
    return (
      <Screen>
        <TopBar />
        <EmptyState
          mascot="dizzy"
          title={t('review.error.title')}
          body={t('review.error.body')}
          action={
            valid ? (
              <Button
                variant="secondary"
                label={t('common.retry')}
                onPress={() => {
                  void q.refetch();
                  void dirs.refetch();
                }}
              />
            ) : undefined
          }
        />
      </Screen>
    );
  }

  if (!detail || !dirs.data) {
    return (
      <Screen scroll={false}>
        <TopBar />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.color.textSecondary} />
        </View>
      </Screen>
    );
  }

  const o = detail.order;

  if (waiting) {
    return (
      <Screen refreshing={refreshing} onRefresh={() => void refresh()}>
        <TopBar eyebrow={orderEyebrow(o)} subtitle={o.equipment_name} caption={o.area_name} />
        <ReviewWaiting onRetry={() => void retry()} retrying={retrying} />
      </Screen>
    );
  }

  if (!review) {
    return (
      <Screen refreshing={refreshing} onRefresh={() => void refresh()}>
        <TopBar eyebrow={orderEyebrow(o)} subtitle={o.equipment_name} caption={o.area_name} />
        <EmptyState mascot="peek" title={t('review.empty.title')} body={t('review.empty.body')} />
      </Screen>
    );
  }

  if (session.role === 'worker') {
    const celebrate = sawWaiting || Date.now() - Date.parse(review.created_at) < FRESH_MS;
    return (
      <WorkerReview
        detail={detail}
        review={review}
        norms={dirs.data.work_norms}
        celebrate={celebrate}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
      />
    );
  }

  return (
    <MasterReview
      detail={detail}
      review={review}
      dirs={dirs.data}
      canAct={session.role === 'master' || session.role === 'admin'}
      refreshing={refreshing}
      onRefresh={() => void refresh()}
    />
  );
}
