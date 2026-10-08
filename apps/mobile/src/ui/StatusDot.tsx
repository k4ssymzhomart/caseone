import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/lib/theme';

/** Worker states, AI verdicts and a neutral gray (PHASE_0 §6.3). */
export type StatusDotTone =
  | 'free'
  | 'working'
  | 'queue'
  | 'off'
  | 'critical'
  | 'success'
  | 'warning'
  | 'info'
  | 'neutral';

export interface StatusDotProps {
  tone: StatusDotTone;
  /** Diameter, `theme.size.dot` (10) by default. */
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/** A 10 px circle in a status tone. Decorative: always pair it with a word (status is never color alone). */
export function StatusDot({ tone, size, style }: StatusDotProps) {
  const theme = useTheme();
  const d = size ?? theme.size.dot;
  const backgroundColor = tone === 'neutral' ? theme.color.textSecondary : theme.status[tone];
  return (
    <View
      accessible={false}
      importantForAccessibility="no"
      style={[{ width: d, height: d, borderRadius: theme.radius.full, backgroundColor }, style]}
    />
  );
}
