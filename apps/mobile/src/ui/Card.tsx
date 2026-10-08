import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/lib/theme';

import { PressableScale } from './PressableScale';

export interface CardProps {
  children?: ReactNode;
  /** Makes the card a tappable surface (PressableScale, role button). */
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  disabled?: boolean;
  /** 16 padding by default; false for full bleed content such as list rows. */
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Surface for grouped content: `bgSubtle`, radius md, hairline border in light mode only (PHASE_0 §6.9). */
export function Card({
  children,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  disabled,
  padded = true,
  style,
  testID,
}: CardProps) {
  const theme = useTheme();
  const surface: ViewStyle = {
    backgroundColor: theme.color.bgSubtle,
    borderRadius: theme.radius.md,
    borderWidth: theme.mode === 'light' ? StyleSheet.hairlineWidth : 0,
    borderColor: theme.color.borderDefault,
    padding: padded ? theme.space[4] : 0,
    overflow: 'hidden',
  };

  if (!onPress) {
    return (
      <View style={[surface, style]} testID={testID}>
        {children}
      </View>
    );
  }

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      testID={testID}
      style={[surface, { minHeight: theme.size.tapMin }, style]}
    >
      {children}
    </PressableScale>
  );
}
