import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/lib/theme';

import { T } from './T';

export interface TapCounterProps {
  /** Built by the screen, for example «5 нажатий · 0:38». */
  text: string;
  /** Position it from the screen (top right, under the safe area). */
  style?: StyleProp<ViewStyle>;
}

/** Demo only: a mono capsule counting taps and seconds on the create screen. Never takes touches. */
export function TapCounter({ text, style }: TapCounterProps) {
  const theme = useTheme();
  return (
    <View
      pointerEvents="none"
      accessibilityRole="text"
      accessibilityLabel={text}
      style={[
        {
          alignSelf: 'flex-end',
          minHeight: theme.size.pill,
          paddingHorizontal: theme.space[3],
          justifyContent: 'center',
          borderRadius: theme.radius.full,
          backgroundColor: theme.color.bgMuted,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.color.borderStrong,
        },
        theme.shadow.soft,
        style,
      ]}
    >
      <T variant="monoM" numberOfLines={1}>
        {text}
      </T>
    </View>
  );
}
