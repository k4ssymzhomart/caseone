import { withAlpha } from '@rota/design';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { haptic } from '@/lib/haptics';
import { useTheme } from '@/lib/theme';

import { PressableScale } from './PressableScale';
import { T } from './T';

export type ChipVariant = 'default' | 'critical';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** critical fills red when selected («Аварийный»). */
  variant?: ChipVariant;
  disabled?: boolean;
  /** Optional mono count after the label. */
  count?: number | string;
  /** Optional second line under the label (footnote). */
  sublabel?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

// PHASE_0 §6.9 Chip: disabled at the kit's opacity 0.4; secondary text on a filled chip at 72%.
const DISABLED_OPACITY = 0.4;
const SUB_ALPHA = 0.72;

/** Selectable chip (PHASE_0 §6.9): height 48, pill, inverse when selected, red when a selected critical. */
export function Chip({
  label,
  selected = false,
  onPress,
  variant = 'default',
  disabled = false,
  count,
  sublabel,
  accessibilityLabel,
  style,
  testID,
}: ChipProps) {
  const theme = useTheme();
  const { color, space } = theme;

  let bg: string = color.bgSubtle;
  let border: string = color.borderDefault;
  let fg: string = color.textPrimary;
  let sub: string = color.textSecondary;
  if (selected && variant === 'critical') {
    bg = color.bgAccent;
    border = color.bgAccent;
    fg = color.textOnAccent;
    sub = withAlpha(color.textOnAccent, SUB_ALPHA);
  } else if (selected) {
    bg = color.bgInverse;
    border = color.bgInverse;
    fg = color.textInverse;
    sub = withAlpha(color.textInverse, SUB_ALPHA);
  }

  // Glove mode: the 48 px chip gets a vertical slop up to tapMin.
  const slop = Math.max(0, Math.ceil((theme.size.tapMin - theme.size.chip) / 2));
  const parts = [label, sublabel, count !== undefined ? String(count) : undefined].filter(Boolean);

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? parts.join(', ')}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      hitSlop={slop > 0 ? { top: slop, bottom: slop } : undefined}
      onPress={() => {
        void haptic.selection();
        onPress?.();
      }}
      testID={testID}
      style={[styles.self, style]}
    >
      <View
        style={[
          styles.body,
          {
            minHeight: theme.size.chip,
            paddingHorizontal: space[4],
            paddingVertical: space[1],
            gap: space[2],
            borderRadius: theme.radius.full,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: border,
            backgroundColor: bg,
          },
          disabled ? { opacity: DISABLED_OPACITY } : null,
        ]}
      >
        <View style={styles.text}>
          <T variant="callout" weight="medium" color={fg} numberOfLines={1}>
            {label}
          </T>
          {sublabel ? (
            <T variant="footnote" color={sub} numberOfLines={1}>
              {sublabel}
            </T>
          ) : null}
        </View>
        {count !== undefined ? (
          <T variant="monoM" color={sub} numberOfLines={1}>
            {String(count)}
          </T>
        ) : null}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  self: { alignSelf: 'flex-start' },
  body: { flexDirection: 'row', alignItems: 'center' },
  text: { flexShrink: 1 },
});
