import { primitives } from '@rota/design';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { haptic as haptics } from '@/lib/haptics';
import { useTheme } from '@/lib/theme';

import { PressableScale } from './PressableScale';
import { T } from './T';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'onDanger' | 'ghostOnDanger';
export type ButtonSize = 'L' | 'M' | 'S';
export type ButtonHaptic = keyof typeof haptics | 'none';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  /** primary (inverse pill) by default. */
  variant?: ButtonVariant;
  /** L 64, M 52 (default), S 40. */
  size?: ButtonSize;
  /** Stretch to the parent's width. Otherwise the button hugs its label. */
  full?: boolean;
  /** Shows a spinner in the text color and keeps the width; presses are ignored. */
  loading?: boolean;
  disabled?: boolean;
  /** Optional glyph before the label, from the allowlist (‹ ← + …). */
  left?: string;
  /** Optional glyph after the label (› → …). */
  right?: string;
  /** Haptic on press. Default: light for primary, danger and onDanger; none otherwise. */
  haptic?: ButtonHaptic;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

// PHASE_0 §6.9 Button: disabled at opacity 0.4.
const DISABLED_OPACITY = 0.4;

const HAPTIC_BY_DEFAULT: Record<ButtonVariant, ButtonHaptic> = {
  primary: 'light',
  secondary: 'none',
  ghost: 'none',
  danger: 'light',
  onDanger: 'light',
  ghostOnDanger: 'none',
};

/** Rota pill button (PHASE_0 §6.9). Pressed: scale 0.98 with opacity 0.92. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'M',
  full = false,
  loading = false,
  disabled = false,
  left,
  right,
  haptic,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: ButtonProps) {
  const theme = useTheme();
  const { color, space, radius } = theme;

  const height = { L: theme.size.buttonL, M: theme.size.buttonM, S: theme.size.buttonS }[size];
  const padding = { L: space[6], M: space[5], S: space[4] }[size];
  const textVariant = size === 'L' ? 'buttonL' : 'buttonM';

  const palette: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: color.bgInverse, fg: color.textInverse },
    secondary: { bg: color.bgMuted, fg: color.textPrimary, border: color.borderDefault },
    ghost: { bg: 'transparent', fg: color.textSecondary },
    danger: { bg: color.bgAccent, fg: color.textOnAccent },
    // The emergency surface is red in both modes: white comes from textOnAccent, and the label is red 700
    // (PHASE_0 §6.9), which no semantic token holds in dark mode, so it is read from the Rota primitives.
    onDanger: { bg: color.textOnAccent, fg: primitives['red/700'] },
    ghostOnDanger: { bg: 'transparent', fg: color.textOnAccent, border: color.textOnAccent },
  };
  const p = palette[variant];

  // Glove mode: the touch target reaches tapMin even for the 40 and 52 sizes.
  const slop = Math.max(0, Math.ceil((theme.size.tapMin - height) / 2));
  const inactive = disabled || loading;
  const feedback = haptic ?? HAPTIC_BY_DEFAULT[variant];

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, busy: loading }}
      disabled={inactive}
      hitSlop={slop > 0 ? { top: slop, bottom: slop } : undefined}
      onPress={() => {
        if (inactive) return;
        if (feedback !== 'none') void haptics[feedback]();
        onPress?.();
      }}
      testID={testID}
      style={[{ alignSelf: full ? 'stretch' : 'flex-start' }, style]}
    >
      <View
        style={[
          styles.body,
          {
            height,
            paddingHorizontal: padding,
            borderRadius: radius.full,
            backgroundColor: p.bg,
          },
          p.border ? { borderWidth: StyleSheet.hairlineWidth, borderColor: p.border } : null,
          disabled ? { opacity: DISABLED_OPACITY } : null,
        ]}
      >
        <View style={[styles.row, { gap: space[2] }, loading ? styles.hidden : null]}>
          {left ? (
            <T variant={textVariant} color={p.fg}>
              {left}
            </T>
          ) : null}
          <T variant={textVariant} color={p.fg} numberOfLines={1} style={styles.label}>
            {label}
          </T>
          {right ? (
            <T variant={textVariant} color={p.fg}>
              {right}
            </T>
          ) : null}
        </View>
        {loading ? (
          <View style={[StyleSheet.absoluteFill, styles.center]}>
            <ActivityIndicator color={p.fg} />
          </View>
        ) : null}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  body: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexShrink: 1 },
  label: { flexShrink: 1 },
  hidden: { opacity: 0 },
  center: { alignItems: 'center', justifyContent: 'center' },
});
