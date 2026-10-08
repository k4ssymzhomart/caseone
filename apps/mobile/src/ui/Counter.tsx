import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/lib/theme';

import { PressableScale } from './PressableScale';
import { T } from './T';

export interface CounterProps {
  value: number | string;
  label: string;
  /** The value is bad (overdue, downtime): the number turns critical. */
  bad?: boolean;
  /** Makes the counter tappable, for example to filter the board. */
  onPress?: () => void;
  accessibilityLabel?: string;
  align?: 'left' | 'center';
  style?: StyleProp<ViewStyle>;
}

/** Shift counter: a `monoL` number with a footnote label below (PHASE_0 §6.9). */
export function Counter({ value, label, bad, onPress, accessibilityLabel, align = 'left', style }: CounterProps) {
  const theme = useTheme();
  const textAlign = align === 'center' ? 'center' : 'left';
  const body = (
    <>
      <T variant="monoL" tone={bad ? 'critical' : 'primary'} align={textAlign} numberOfLines={1}>
        {String(value)}
      </T>
      <T variant="footnote" tone="secondary" align={textAlign} numberOfLines={2}>
        {label}
      </T>
    </>
  );
  const base: ViewStyle = { alignItems: align === 'center' ? 'center' : 'flex-start' };
  const a11yLabel = accessibilityLabel ?? `${value} ${label}`;

  if (!onPress) {
    return (
      <View accessible accessibilityLabel={a11yLabel} style={[base, style]}>
        {body}
      </View>
    );
  }

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      style={[base, { minHeight: theme.size.tapMin, justifyContent: 'center' }, style]}
    >
      {body}
    </PressableScale>
  );
}
