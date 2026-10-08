// «Изменить оценку»: score 0..100, verdict, comment, then close with the master's final values (CLAUDE.md §12).
import { VERDICTS, VERDICT_LABEL, type AiReview, type Verdict } from '@rota/shared';
import { useState } from 'react';
import { View } from 'react-native';

import { t } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { ActionList } from '@/ui/ActionList';
import { Button } from '@/ui/Button';
import { Stepper } from '@/ui/Stepper';
import { T } from '@/ui/T';
import { TextArea } from '@/ui/TextArea';

import { verdictForScore } from './checks';
import { SheetModal } from './SheetModal';

const SCORE_STEP = 5;

export interface OverridePayload {
  final_verdict: Verdict;
  final_score: number;
  comment?: string;
}

export interface OverrideSheetProps {
  review: Pick<AiReview, 'score' | 'verdict'>;
  onClose: () => void;
  onSubmit: (payload: OverridePayload) => void;
}

/** Mount it only while open: every opening starts from the AI's values. */
export function OverrideSheet({ review, onClose, onSubmit }: OverrideSheetProps) {
  const theme = useTheme();
  const [score, setScore] = useState(review.score);
  const [verdict, setVerdict] = useState<Verdict>(review.verdict);
  const [verdictTouched, setVerdictTouched] = useState(false);
  const [comment, setComment] = useState('');

  const changeScore = (next: number) => {
    setScore(next);
    if (!verdictTouched) setVerdict(verdictForScore(next));
  };

  const submit = () => {
    const text = comment.trim();
    onSubmit({ final_verdict: verdict, final_score: score, ...(text ? { comment: text } : {}) });
  };

  return (
    <SheetModal
      visible
      onClose={onClose}
      title={t('action.override')}
      footer={<Button label={t('review.override.submit')} size="L" full onPress={submit} />}
    >
      <View style={{ gap: theme.space[2] }}>
        <T variant="footnote" tone="secondary">
          {t('review.override.score')}
        </T>
        <Stepper
          value={score}
          onChange={changeScore}
          min={0}
          max={100}
          step={SCORE_STEP}
          unit={t('review.outOf')}
          format={(v) => String(Math.round(v))}
          accessibilityLabel={t('review.override.score')}
        />
      </View>
      <View style={{ gap: theme.space[2] }}>
        <T variant="footnote" tone="secondary">
          {t('review.override.verdict')}
        </T>
        <View style={{ marginHorizontal: -theme.size.gutter }}>
          <ActionList
            items={VERDICTS.map((v) => ({
              key: v,
              label: VERDICT_LABEL[v],
              ...(v === 'rework' ? { tone: 'critical' as const } : {}),
            }))}
            value={verdict}
            onSelect={(key) => {
              setVerdict(key as Verdict);
              setVerdictTouched(true);
            }}
          />
        </View>
      </View>
      <TextArea
        label={t('review.override.comment')}
        placeholder={t('review.override.commentPlaceholder')}
        value={comment}
        onChangeText={setComment}
      />
    </SheetModal>
  );
}
