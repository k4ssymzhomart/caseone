// «ИИ проверяет наряд»: mascot search and four checks ticking in sequence while the review is not there yet.
// The screen's query refetches on realtime and polls every 2 s; after a while a retry starts the check again
// (the rules only check is idempotent per attempt, CLAUDE.md §11).
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { t } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { Button } from '@/ui/Button';
import { CheckRow } from '@/ui/CheckRow';
import { ListGroup } from '@/ui/ListGroup';
import { Mascot } from '@/ui/Mascot';
import { T } from '@/ui/T';

const STEPS = ['review.pending.completeness', 'review.pending.photo', 'review.pending.materials', 'review.pending.time'] as const;
const TICK_MS = 900;
/** After this long without a review, offer «Проверить ещё раз». */
const RETRY_AFTER_MS = 15_000;
const PENDING_OPACITY = 0.5;

export interface ReviewWaitingProps {
  onRetry: () => void;
  retrying: boolean;
}

export function ReviewWaiting({ onRetry, retrying }: ReviewWaitingProps) {
  const theme = useTheme();
  const [step, setStep] = useState(0);
  const [showRetry, setShowRetry] = useState(false);

  useEffect(() => {
    const tick = setInterval(() => setStep((s) => Math.min(STEPS.length - 1, s + 1)), TICK_MS);
    const retry = setTimeout(() => setShowRetry(true), RETRY_AFTER_MS);
    return () => {
      clearInterval(tick);
      clearTimeout(retry);
    };
  }, []);

  return (
    <View style={{ gap: theme.space[6] }}>
      <View style={{ alignItems: 'center', gap: theme.space[3], paddingTop: theme.space[4] }}>
        <Mascot name="search" size={140} />
        <T variant="title2" align="center" accessibilityRole="header" accessibilityLiveRegion="polite">
          {t('review.checking')}
        </T>
        <T variant="callout" tone="secondary" align="center">
          {t('review.checkingBody')}
        </T>
      </View>

      <ListGroup>
        {STEPS.map((key, i) => {
          const done = i < step;
          const running = i === step;
          return (
            <CheckRow
              key={key}
              status={done ? 'pass' : 'info'}
              title={t(key)}
              {...(done
                ? { message: t('review.pending.done') }
                : running
                  ? { message: t('review.pending.running') }
                  : {})}
              style={done || running ? undefined : { opacity: PENDING_OPACITY }}
            />
          );
        })}
      </ListGroup>

      {showRetry ? (
        <Button variant="secondary" size="L" full label={t('review.retry')} loading={retrying} onPress={onRetry} />
      ) : null}
    </View>
  );
}
