// Closing report of the worker (PHASE_0 §7.1 close): loads the order and the directories, then mounts the
// form once. The status is judged when the screen opens, so the refetch after `complete` does not swap the
// form for the «already sent» state while the screen moves on to the review.
import type { Directories, OrderDetail, Status } from '@rota/shared';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { CloseForm } from '@/features/close/CloseForm';
import { TopBar } from '@/features/review/TopBar';
import { useApi } from '@/lib/api';
import { useDirectories } from '@/lib/directories';
import { t } from '@/lib/i18n';
import { qk } from '@/lib/keys';
import { useTheme } from '@/lib/theme';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { Screen } from '@/ui/Screen';

/** The report can be filled from these; paused and rework are resumed on submit. */
const CLOSABLE: readonly Status[] = ['in_progress', 'paused', 'rework'];
const REVIEWABLE: readonly Status[] = ['done', 'ai_review', 'closed'];

export default function CloseScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = Number(raw);
  const valid = Number.isFinite(id) && id > 0;
  const api = useApi();
  const theme = useTheme();
  const dirs = useDirectories();
  const q = useQuery({ queryKey: qk.order(id), queryFn: () => api.orders.get(id), enabled: valid });

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

  if (!q.data || !dirs.data) {
    return (
      <Screen scroll={false}>
        <TopBar />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.color.textSecondary} />
        </View>
      </Screen>
    );
  }

  return <CloseGate key={id} detail={q.data} dirs={dirs.data} />;
}

function CloseGate({ detail, dirs }: { detail: OrderDetail; dirs: Directories }) {
  const router = useRouter();
  const [openedStatus] = useState<Status>(() => detail.order.status);

  if (CLOSABLE.includes(openedStatus)) return <CloseForm detail={detail} dirs={dirs} />;

  const o = detail.order;
  const reviewable = REVIEWABLE.includes(openedStatus);
  return (
    <Screen>
      <TopBar />
      <EmptyState
        mascot={reviewable ? 'check' : 'peek'}
        title={reviewable ? t('close.unavailable.title') : t('close.title')}
        body={t('close.unavailable.body')}
        action={
          reviewable ? (
            <Button
              variant="secondary"
              label={t('close.openReview')}
              onPress={() => router.replace(`/order/${o.id}/review` as Href)}
            />
          ) : undefined
        }
      />
    </Screen>
  );
}
