import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/lib/theme';

import { StatusDot, type StatusDotTone } from './StatusDot';
import { T } from './T';

export type PillTone = StatusDotTone;

/** Height of the large pill on worker screens (PHASE_0 §6.9 Pill, worker variant). */
const PILL_L_HEIGHT = 36;

export interface PillProps {
  label: string;
  tone?: PillTone;
  /** 'M' 28 high (default), 'L' 36 high for worker screens. */
  size?: 'M' | 'L';
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/** Status pill: a dot plus a word on a soft tinted fill (PHASE_0 §6.9). */
export function Pill({ label, tone = 'neutral', size = 'M', accessibilityLabel, style }: PillProps) {
  const theme = useTheme();
  const large = size === 'L';
  const backgroundColor = tone === 'neutral' ? theme.color.bgMuted : theme.statusSoft[tone];
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        {
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space[2],
          height: large ? PILL_L_HEIGHT : theme.size.pill,
          paddingHorizontal: large ? theme.space[4] : theme.space[3],
          borderRadius: theme.radius.full,
          backgroundColor,
        },
        style,
      ]}
    >
      <StatusDot tone={tone} />
      <T variant={large ? 'callout' : 'footnote'} weight="semibold" tone="primary" numberOfLines={1}>
        {label}
      </T>
    </View>
  );
}
