import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { haptic } from '@/lib/haptics';
import { useTheme } from '@/lib/theme';

import { PressableScale } from './PressableScale';
import { T } from './T';

export interface StepperProps {
  value: number;
  onChange: (next: number) => void;
  /** Lower bound, 0 by default. */
  min?: number;
  /** Upper bound, unbounded by default. */
  max?: number;
  /** Step, 1 by default; decimals allowed (0.5). */
  step?: number;
  /** Unit after the value, e.g. «шт», «л», «кг». */
  unit?: string;
  /** Value formatter. Default: digits with a decimal comma («1,5»). */
  format?: (value: number) => string;
  disabled?: boolean;
  /** Required: what is being adjusted (the material name). */
  accessibilityLabel: string;
  /** Labels for the − and + buttons; the glyphs by default. */
  decrementLabel?: string;
  incrementLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

function decimals(n: number): number {
  const s = String(n);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

function defaultFormat(v: number): string {
  return String(v).replace('.', ',');
}

/** − value + stepper (PHASE_0 §6.9): 48 px round buttons on bgMuted, value in monoL with an optional unit. */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  step = 1,
  unit,
  format = defaultFormat,
  disabled = false,
  accessibilityLabel,
  decrementLabel = '−',
  incrementLabel = '+',
  style,
  testID,
}: StepperProps) {
  const theme = useTheme();
  const { color, space } = theme;

  const places = Math.max(decimals(step), decimals(min));
  const round = (v: number) => Number(v.toFixed(places));
  const canDec = !disabled && value > min;
  const canInc = !disabled && value < max;

  const change = (dir: 1 | -1) => {
    if ((dir < 0 && !canDec) || (dir > 0 && !canInc)) return;
    const next = Math.min(max, Math.max(min, round(value + dir * step)));
    if (next === value) return;
    void haptic.selection();
    onChange(next);
  };

  const shown = format(value);
  // 48 per §6.9 (theme.size.chip); the slop brings the target up to tapMin.
  const btn = theme.size.chip;
  const slop = Math.max(0, Math.ceil((theme.size.tapMin - btn) / 2));

  const renderButton = (dir: 1 | -1) => {
    const enabled = dir < 0 ? canDec : canInc;
    return (
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={dir < 0 ? decrementLabel : incrementLabel}
        accessibilityState={{ disabled: !enabled }}
        disabled={!enabled}
        hitSlop={slop}
        onPress={() => change(dir)}
        style={[
          styles.button,
          {
            width: btn,
            height: btn,
            borderRadius: theme.radius.full,
            backgroundColor: color.bgMuted,
          },
        ]}
      >
        <T variant="title2" color={enabled ? color.textPrimary : color.textDisabled} align="center">
          {dir < 0 ? '−' : '+'}
        </T>
      </PressableScale>
    );
  };

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: unit ? `${shown} ${unit}` : shown }}
      accessibilityState={{ disabled }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => change(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
      style={[styles.row, { gap: space[2] }, style]}
      testID={testID}
    >
      {renderButton(-1)}
      <View style={[styles.value, { minWidth: space[16], gap: space[1] }]}>
        <T variant="monoL" tone={disabled ? 'disabled' : 'primary'} numberOfLines={1}>
          {shown}
        </T>
        {unit ? (
          <T variant="footnote" tone="secondary" numberOfLines={1}>
            {unit}
          </T>
        ) : null}
      </View>
      {renderButton(1)}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
  button: { alignItems: 'center', justifyContent: 'center' },
  value: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' },
});
