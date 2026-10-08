// Worker report (CLAUDE.md §12): score «из 100» and «из 5», «Что хорошо», «Что улучшить», time against the
// norm, a mascot per verdict. Footer: «Начать доработку» on rework, otherwise back.
import type { AiReview, OrderDetail, WorkNorm } from '@rota/shared';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';

import { orderEyebrow } from '@/features/orders/present';
import { useOrderAction } from '@/features/orders/useOrderAction';
import { haptic } from '@/lib/haptics';
import { t } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { Banner } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Mascot } from '@/ui/Mascot';
import { ScoreBadge } from '@/ui/ScoreBadge';
import { Screen } from '@/ui/Screen';
import { T } from '@/ui/T';

import { timeLine, toVerdictTone, verdictLabel, workerFeedback, workerMascot } from './checks';
import { FeedbackList } from './FeedbackList';
import { TopBar, useGoBack } from './TopBar';

export interface WorkerReviewProps {
  detail: OrderDetail;
  review: AiReview;
  norms: readonly WorkNorm[];
  /** The verdict just arrived on this screen: play the success or error haptic once. */
  celebrate: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}

/** The master's comment of the return that sent the order back, if that was the last step. */
function returnComment(detail: OrderDetail): string | null {
  const last = detail.events[detail.events.length - 1];
  return last && last.action === 'return' && last.comment ? last.comment : null;
}

export function WorkerReview({ detail, review, norms, celebrate, refreshing, onRefresh }: WorkerReviewProps) {
  const theme = useTheme();
  const router = useRouter();
  const goBack = useGoBack();
  const { run, pending } = useOrderAction();
  const o = detail.order;

  const closed = o.status === 'closed';
  // While open, the master's decision on this attempt (a return) outranks the AI's verdict.
  const verdict = closed && o.final_verdict ? o.final_verdict : (review.master_verdict ?? review.verdict);
  const score = closed && o.final_score != null ? o.final_score : review.score;
  const score5 = Math.max(1, Math.min(5, Math.round(score / 20)));
  const waitingMaster = o.status === 'ai_review';
  const mascot = workerMascot(verdict, waitingMaster && review.needs_master_review);
  const heading = closed
    ? t('review.closed')
    : o.status === 'rework'
      ? t('review.needsRework')
      : waitingMaster
        ? t('review.waitsMaster')
        : t('review.title');
  const { good, improve } = workerFeedback(review);
  const time = timeLine(o, norms);
  const overridden = closed && o.final_score != null && o.final_score !== review.score;
  const masterNote = o.status === 'rework' ? returnComment(detail) : null;

  const fired = useRef<number | null>(null);
  useEffect(() => {
    if (!celebrate || fired.current === review.id) return;
    fired.current = review.id;
    void (verdict === 'rework' ? haptic.error() : haptic.success());
  }, [celebrate, review.id, verdict]);

  const startRework = async () => {
    const res = await run(o.id, 'resume_rework', {}, { success: t('review.hud.rework'), number: o.number, strongHaptic: true });
    if (res) router.replace(`/order/${o.id}` as Href);
  };

  const footer =
    o.status === 'rework' ? (
      <Button
        label={t('action.resume_rework')}
        size="L"
        full
        loading={pending === 'resume_rework'}
        onPress={() => void startRework()}
      />
    ) : o.status === 'ai_review' || closed ? (
      <Button label={t('review.done')} size="L" full onPress={goBack} />
    ) : (
      <Button label={t('review.toOrder')} size="L" full onPress={() => router.replace(`/order/${o.id}` as Href)} />
    );

  return (
    <Screen footer={footer} refreshing={refreshing} onRefresh={onRefresh}>
      <TopBar eyebrow={orderEyebrow(o)} subtitle={o.equipment_name} caption={o.area_name} />

      <View style={{ alignItems: 'center', gap: theme.space[3], marginBottom: theme.space[6] }}>
        <Mascot name={mascot} size={120} />
        <T variant="title2" align="center" accessibilityRole="header">
          {heading}
        </T>
        <ScoreBadge
          align="center"
          score={score}
          outOfLabel={t('review.outOf')}
          verdictLabel={verdictLabel(verdict)}
          verdictTone={toVerdictTone(verdict)}
          secondary={t('review.score5', { score5 })}
        />
        {overridden ? (
          <T variant="callout" tone="secondary" align="center">
            {t('review.byMaster', { score: review.score })}
          </T>
        ) : null}
      </View>

      <View style={{ gap: theme.space[6] }}>
        {masterNote ? <Banner tone="critical" text={t('review.masterComment', { comment: masterNote })} /> : null}

        {time ? (
          <Card>
            <T variant="bodyL">{time}</T>
          </Card>
        ) : null}

        {o.status === 'rework' ? (
          <>
            <FeedbackList title={t('review.improve')} items={improve} kind="improve" emptyText={t('review.noRemarks')} />
            <FeedbackList title={t('review.good')} items={good} kind="good" />
          </>
        ) : (
          <>
            <FeedbackList title={t('review.good')} items={good} kind="good" />
            <FeedbackList title={t('review.improve')} items={improve} kind="improve" emptyText={t('review.noRemarks')} />
          </>
        )}
      </View>
    </Screen>
  );
}
