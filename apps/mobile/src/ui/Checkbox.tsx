import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { haptic } from '@/lib/haptics';
import { useTheme } from '@/lib/theme';

import { PressableScale } from './PressableScale';
import { T } from './T';

// PHASE_0 §6.9 Checkbox: a 24 px box inside a 56 px row.
const BOX = 24;
// The unchecked edge is thicker than a list hairline so it reads in sunlight and through gloves.
const BOX_BORDER = 1.5;
const DISABLED_OPACITY = 0.4;

export interface CheckboxProps {
  label: string;
  sublabel?: string;
  checked: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Checkbox row: red box with a white ✓ when checked; the whole row is the target. */
export function Checkbox({
  label,
  sublabel,
  checked,
  onChange,
  disabled = false,
  accessibilityLabel,
  style,
  testID,
}: CheckboxProps) {
  const theme = useTheme();
  const { color, space } = theme;

  return (
    <PressableScale
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel ?? (sublabel ? `${label}. ${sublabel}` : label)}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => {
        void haptic.selection();
        onChange?.(!checked);
      }}
      testID={testID}
      style={[{ minHeight: theme.size.tapMin, justifyContent: 'center' }, style]}
    >
      <View
        style={[
          styles.row,
          { gap: space[3], paddingVertical: space[2] },
          disabled ? { opacity: DISABLED_OPACITY } : null,
        ]}
      >
        <View
          style={[
            styles.box,
            {
              width: BOX,
              height: BOX,
              borderRadius: theme.radius.xs,
              borderWidth: BOX_BORDER,
              borderColor: checked ? color.bgAccent : color.borderStrong,
              backgroundColor: checked ? color.bgAccent : 'transparent',
            },
          ]}
        >
          {checked ? (
            <T variant="callout" weight="bold" tone="onAccent" align="center">
              ✓
            </T>
          ) : null}
        </View>
        <View style={styles.text}>
          <T variant="body">{label}</T>
          {sublabel ? (
            <T variant="footnote" tone="secondary">
              {sublabel}
            </T>
          ) : null}
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  box: { alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1 },
});
