// Master report (CLAUDE.md §12): verdict, score, confidence, model, per check breakdown, before and after
// photos, materials against the norm, works, timeline. Actions while ai_review or rework:
// «Согласен, закрыть», «Изменить оценку», «Вернуть на доработку».
import {
  formatDateTime,
  formatDuration,
  hhmm,
  isToday,
  reasonLabel,
  type AiReview,
  type Directories,
  type OrderDetail,
  type OrderEvent,
} from '@rota/shared';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { orderEyebrow } from '@/features/orders/present';
import { useOrderAction } from '@/features/orders/useOrderAction';
import { indexDirectories } from '@/lib/directories';
import { t } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { Banner } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { CheckRow } from '@/ui/CheckRow';
import { Eyebrow } from '@/ui/Eyebrow';
import { ListGroup } from '@/ui/ListGroup';
import { ScoreBadge } from '@/ui/ScoreBadge';
import { Screen } from '@/ui/Screen';
import { T } from '@/ui/T';
import { Timeline, type TimelineItem, type TimelineTone } from '@/ui/Timeline';

import {
  checkRowProps,
  downtimeMinutes,
  latencyText,
  reviewChecks,
  scoreSecondary,
  timeLine,
  toVerdictTone,
  verdictLabel,
} from './checks';
import { MaterialsNorm } from './MaterialsNorm';
import { OverrideSheet, type OverridePayload } from './OverrideSheet';
import { PhotoCompare } from './PhotoCompare';
import { ReturnSheet } from './ReturnSheet';
import { TopBar } from './TopBar';

export interface MasterReviewProps {
  detail: OrderDetail;
  review: AiReview;
  dirs: Directories;
  /** Masters and admins decide; a manager reads only. */
  canAct: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}

function eventTone(e: OrderEvent): TimelineTone {
  if (e.to_status === 'rework' || e.action === 'reject' || e.action === 'cancel') return 'critical';
  if (e.action === 'close') return 'success';
  if (e.action === 'pause') return 'warning';
  if (e.action === 'start' || e.action === 'resume' || e.action === 'resume_rework') return 'working';
  if (e.action === 'review_started' || e.action === 'ai_result') return 'info';
  return 'neutral';
}

function Block({ label, children }: { label: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ paddingHorizontal: theme.space[4], paddingVertical: theme.space[3], gap: theme.space[1] }}>
      <T variant="footnote" tone="secondary">
        {label}
      </T>
      {children}
    </View>
  );
}

export function MasterReview({ detail, review, dirs, canAct, refreshing, onRefresh }: MasterReviewProps) {
  const theme = useTheme();
  const { run, pending } = useOrderAction();
  const [sheet, setSheet] = useState<'override' | 'return' | null>(null);
  const o = detail.order;
  const idx = indexDirectories(dirs);
  const norm = o.fault_code ? dirs.work_norms.find((n) => n.fault_code === o.fault_code) : undefined;
  const fc = o.fault_code ? idx.faultCodes.get(o.fault_code) : undefined;

  const closed = o.status === 'closed';
  // While open, the master's decision on this attempt (a return) outranks the AI's verdict.
  const verdict = closed && o.final_verdict ? o.final_verdict : (review.master_verdict ?? review.verdict);
  const score = closed && o.final_score != null ? o.final_score : review.score;
  const overridden = closed && (o.final_score !== review.score || o.final_verdict !== review.verdict);
  const returned = !closed && review.master_verdict != null && review.master_verdict !== review.verdict;
  // «из 5» follows the score shown (CLAUDE.md §11: clamp(round(score / 20), 1, 5)); the AI's own values stay in
  // the «ИИ: …» line below.
  const secondary = overridden
    ? t('review.score5', { score5: Math.max(1, Math.min(5, Math.round(score / 20))) })
    : scoreSecondary(review);
  const needsMaster = o.status === 'ai_review' && review.needs_master_review;
  const showActions = canAct && (o.status === 'ai_review' || o.status === 'rework');
  const time = timeLine(o, dirs.work_norms);
  const downtime = downtimeMinutes(o);
  const checks = reviewChecks(review);
  const latency = latencyText(review.latency_ms);
  const busy = pending !== null;

  const agree = () => void run(o.id, 'close', {}, { success: t('review.hud.closed'), number: o.number });
  const override = (p: OverridePayload) => {
    setSheet(null);
    void run(o.id, 'close', p, { success: t('review.hud.closed'), number: o.number });
  };
  const sendBack = (comment: string) => {
    setSheet(null);
    void run(o.id, 'return', { comment }, { success: t('review.hud.returned'), number: o.number });
  };

  const sameDay = detail.events.every((e) => isToday(e.created_at));
  const timeline: TimelineItem[] = detail.events.map((e) => {
    const actor = e.actor_id
      ? (idx.employees.get(e.actor_id)?.short_name ?? t('event.actor.system'))
      : e.action === 'review_started' || e.action === 'ai_result'
        ? t('review.actor.ai')
        : t('event.actor.system');
    const extra = [e.reason ? reasonLabel(e.reason) : null, e.comment].filter(Boolean).join(' · ');
    return {
      id: String(e.id),
      time: sameDay ? hhmm(e.created_at) : formatDateTime(e.created_at),
      title: actor,
      subtitle: extra ? `${t(`event.${e.action}`)} · ${extra}` : t(`event.${e.action}`),
      tone: eventTone(e),
    };
  });

  const footer = showActions ? (
    o.status === 'ai_review' ? (
      <>
        <Button
          label={t('action.close')}
          size="L"
          full
          loading={pending === 'close'}
          disabled={busy && pending !== 'close'}
          onPress={agree}
        />
        <Button label={t('action.override')} variant="secondary" size="M" full disabled={busy} onPress={() => setSheet('override')} />
        <Button
          label={t('action.return')}
          variant="secondary"
          size="M"
          full
          loading={pending === 'return'}
          disabled={busy && pending !== 'return'}
          onPress={() => setSheet('return')}
        />
      </>
    ) : (
      <Button label={t('action.override')} size="L" full loading={pending === 'close'} onPress={() => setSheet('override')} />
    )
  ) : undefined;

  return (
    <Screen footer={footer} refreshing={refreshing} onRefresh={onRefresh}>
      <TopBar
        eyebrow={orderEyebrow(o)}
        eyebrowTone={o.priority === 'emergency' ? 'critical' : 'secondary'}
        title={t('review.title')}
        subtitle={o.equipment_name}
        caption={`${o.area_name} · ${t('review.assignee', { name: o.assignee_short_name })}`}
      />

      <View style={{ gap: theme.space[6] }}>
        {needsMaster ? <Banner tone="warning" text={t('verdict.needs_master_review')} /> : null}

        <Card style={{ gap: theme.space[4] }}>
          {closed ? <Eyebrow>{t('review.final')}</Eyebrow> : null}
          <ScoreBadge
            score={score}
            outOfLabel={t('review.outOf')}
            verdictLabel={verdictLabel(verdict)}
            verdictTone={toVerdictTone(verdict)}
            secondary={secondary}
          />
          {overridden || returned ? (
            <T variant="callout" tone="secondary">
              {t('review.aiWas', { score: review.score, verdict: verdictLabel(review.verdict) })}
            </T>
          ) : null}
          {(closed || returned) && review.master_comment ? <T variant="body">{review.master_comment}</T> : null}
          {review.model ? (
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: theme.space[2], flexWrap: 'wrap' }}>
              <T variant="footnote" tone="secondary">
                {t('review.model')}
              </T>
              <T variant="monoM">{review.model}</T>
              {latency ? (
                <T variant="monoM" tone="secondary">
                  {`· ${latency}`}
                </T>
              ) : null}
            </View>
          ) : null}
        </Card>

        {review.report_master?.summary ? (
          <View style={{ gap: theme.space[2] }}>
            <Eyebrow style={{ paddingHorizontal: theme.space[4] }}>{t('review.summary')}</Eyebrow>
            <Card>
              <T variant="body">{review.report_master.summary}</T>
            </Card>
          </View>
        ) : null}

        {checks.length > 0 ? (
          <ListGroup header={t('review.checks')}>
            {checks.map((c) => (
              <CheckRow key={c.id} {...checkRowProps(c)} />
            ))}
          </ListGroup>
        ) : null}

        <View style={{ gap: theme.space[2] }}>
          <Eyebrow style={{ paddingHorizontal: theme.space[4] }}>{t('review.photos')}</Eyebrow>
          <PhotoCompare photos={detail.photos} />
        </View>

        <MaterialsNorm materials={detail.materials} norm={norm} faultCode={o.fault_code} />

        <ListGroup header={t('review.works')}>
          <Block label={t('review.worksDone')}>
            <T variant="body" tone={o.works_done ? 'primary' : 'secondary'}>
              {o.works_done || t('review.worksEmpty')}
            </T>
          </Block>
          <Block label={t('review.faultCode')}>
            {o.fault_code ? (
              <View style={{ flexDirection: 'row', gap: theme.space[2], alignItems: 'baseline' }}>
                <T variant="monoM">{o.fault_code}</T>
                <T variant="body" style={{ flex: 1 }}>
                  {fc?.name ?? ''}
                </T>
              </View>
            ) : (
              <T variant="body" tone="secondary">
                {t('review.faultCodeEmpty')}
              </T>
            )}
          </Block>
          {time ? (
            <Block label={t('review.timeRow')}>
              <T variant="body">{time}</T>
            </Block>
          ) : null}
          {downtime != null ? (
            <Block label={t('review.downtimeRow')}>
              <T variant="body">{formatDuration(Math.max(1, downtime))}</T>
            </Block>
          ) : null}
          {o.closing_comment ? (
            <Block label={t('review.commentRow')}>
              <T variant="body">{o.closing_comment}</T>
            </Block>
          ) : null}
        </ListGroup>

        {timeline.length ? (
          <ListGroup header={t('review.timeline')}>
            <View style={{ padding: theme.space[4] }}>
              <Timeline items={timeline} timeColumnWidth={sameDay ? undefined : theme.space[24] + theme.space[2]} />
            </View>
          </ListGroup>
        ) : null}
      </View>

      {sheet === 'override' ? (
        <OverrideSheet review={review} onClose={() => setSheet(null)} onSubmit={override} />
      ) : null}
      {sheet === 'return' ? <ReturnSheet onClose={() => setSheet(null)} onSubmit={sendBack} /> : null}
    </Screen>
  );
}
