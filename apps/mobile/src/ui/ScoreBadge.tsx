import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/lib/theme';

import { Pill } from './Pill';
import { T } from './T';

/** AI verdict tones: accepted, with remarks, rework, needs master review (PHASE_0 §6.3). */
export type VerdictTone = 'success' | 'warning' | 'critical' | 'info';

export interface ScoreBadgeProps {
  /** The score, shown in monoDisplay. A string lets the screen pass a placeholder. */
  score: number | string;
  /** Label next to the score, «из 100». */
  outOfLabel: string;
  /** Verdict word for the pill («Принято», «Принято с замечаниями», «Требует доработки»). */
  verdictLabel: string;
  verdictTone: VerdictTone;
  /** Optional line under the pill in monoM («4 из 5 · уверенность 86%»). */
  secondary?: string;
  /** 'left' by default; 'center' for hero placements. */
  align?: 'left' | 'center';
  /** Spoken label; by default the visible strings joined. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** AI score: monoDisplay number, «из 100», a verdict pill and an optional mono line (PHASE_0 §6.9). */
export function ScoreBadge({
  score,
  outOfLabel,
  verdictLabel,
  verdictTone,
  secondary,
  align = 'left',
  accessibilityLabel,
  style,
  testID,
}: ScoreBadgeProps) {
  const theme = useTheme();
  const center = align === 'center';
  const label =
    accessibilityLabel ??
    [`${score} ${outOfLabel}`, verdictLabel, secondary].filter(Boolean).join(', ');

  return (
    <View
      accessible
      accessibilityLabel={label}
      testID={testID}
      style={[{ alignItems: center ? 'center' : 'flex-start' }, style]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <T variant="monoDisplay" numberOfLines={1}>
          {String(score)}
        </T>
        <T variant="callout" tone="secondary" style={{ marginLeft: theme.space[2] }}>
          {outOfLabel}
        </T>
      </View>
      <Pill
        label={verdictLabel}
        tone={verdictTone}
        style={{ alignSelf: center ? 'center' : 'flex-start', marginTop: theme.space[2] }}
      />
      {secondary ? (
        <T
          variant="monoM"
          tone="secondary"
          align={center ? 'center' : 'left'}
          style={{ marginTop: theme.space[2] }}
        >
          {secondary}
        </T>
      ) : null}
    </View>
  );
}
