import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { haptic } from '@/lib/haptics';
import { useTheme } from '@/lib/theme';

import { PressableScale } from './PressableScale';
import { T } from './T';

/** Keypad key size, about 104 × 72 (PHASE_0 §6.9). */
export const KEYCAP_WIDTH = 104;
export const KEYCAP_HEIGHT = 72;
/** A 2 px darker base line at the bottom instead of a shadow (PHASE_0 §6.9). */
const BASE_LINE = 2;
/** A pressed key sinks by 1 px, like the Rota web Keycap. */
const PRESS_DEPTH = 1;
/** Disabled opacity, as for Button (PHASE_0 §6.9). */
const DISABLED_OPACITY = 0.4;

export type KeycapVariant = 'default' | 'inverse';
export type KeycapKind = 'digit' | 'text';

export interface KeycapProps {
  label: string;
  onPress?: () => void;
  /** `inverse` is the «Далее» key: bgInverse with textInverse. */
  variant?: KeycapVariant;
  /** `digit` sets the label in title1, `text` in buttonM. Defaults to `digit` for a single digit label. */
  kind?: KeycapKind;
  disabled?: boolean;
  /** Spoken label; defaults to `label`. */
  accessibilityLabel?: string;
  width?: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Rota keycap: bgControl face, borderStrong hairline, a darker 2 px base line, radius md. */
export function Keycap({
  label,
  onPress,
  variant = 'default',
  kind,
  disabled = false,
  accessibilityLabel,
  width = KEYCAP_WIDTH,
  height = KEYCAP_HEIGHT,
  style,
  testID,
}: KeycapProps) {
  const theme = useTheme();
  const [pressed, setPressed] = useState(false);
  const c = theme.color;
  const dark = theme.mode === 'dark';
  const resolvedKind: KeycapKind = kind ?? (/^\d$/.test(label) ? 'digit' : 'text');

  // Dark: the Rota keycap (bgControl). Light: bgControl equals borderStrong there and reads as a gray slab,
  // so the face is bgElevated and bgControl becomes the base line.
  const palette =
    variant === 'inverse'
      ? {
          face: c.bgInverse,
          pressedFace: c.bgInverseHover,
          edge: c.borderInverse,
          base: c.bgInverseHover,
        }
      : {
          face: dark ? c.bgControl : c.bgElevated,
          pressedFace: c.bgMuted,
          edge: c.borderStrong,
          base: dark ? c.borderDefault : c.bgControl,
        };

  return (
    <PressableScale
      testID={testID}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={() => {
        haptic.selection();
        onPress?.();
      }}
      style={[{ width, height }, style]}
    >
      {/* The dim sits on the face: PressableScale's animated opacity overrides an outer opacity. */}
      <View
        style={[
          styles.face,
          {
            borderRadius: theme.radius.md,
            backgroundColor: pressed ? palette.pressedFace : palette.face,
            borderColor: palette.edge,
            borderBottomColor: palette.base,
            paddingHorizontal: theme.space[2],
            transform: [{ translateY: pressed ? PRESS_DEPTH : 0 }],
          },
          disabled ? { opacity: DISABLED_OPACITY } : null,
        ]}
      >
        <T
          variant={resolvedKind === 'digit' ? 'title1' : 'buttonM'}
          tone={variant === 'inverse' ? 'inverse' : 'primary'}
          align="center"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {label}
        </T>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  face: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: BASE_LINE,
  },
});
