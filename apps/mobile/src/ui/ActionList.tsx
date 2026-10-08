import { StyleSheet, View } from 'react-native';

import { haptic } from '@/lib/haptics';
import { useTheme } from '@/lib/theme';

import { PressableScale } from './PressableScale';
import { T } from './T';

/** Disabled opacity, as for Button (PHASE_0 §6.9). */
const DISABLED_OPACITY = 0.4;
/** Full width rows scale less than the kit's 0.98, which would pull their edges in visibly. */
const ROW_PRESS_SCALE = 0.99;

export interface ActionListItem {
  key: string;
  label: string;
  sublabel?: string;
  /** `critical` sets the label in red («Аварийный», a destructive choice). */
  tone?: 'critical';
  disabled?: boolean;
  /** Spoken label; defaults to the label plus the sublabel. */
  accessibilityLabel?: string;
}

export interface ActionListProps {
  items: readonly ActionListItem[];
  /** Selected key; null or undefined selects nothing. */
  value?: string | null;
  onSelect: (key: string) => void;
}

/**
 * Selectable 64 px rows for sheets (reasons, priority, deadline presets).
 * The selected row shows a red ✓ on the right on a muted background; hairline separators inset 16.
 */
export function ActionList({ items, value, onSelect }: ActionListProps) {
  const theme = useTheme();
  // Sheets are bgElevated, which equals bgMuted in dark mode; the selected row takes the next step of the
  // gray ramp there so it stays visible.
  const selectedBg = theme.mode === 'dark' ? theme.color.borderDefault : theme.color.bgMuted;

  return (
    <View accessibilityRole="radiogroup">
      {items.map((item, index) => {
        const selected = item.key === value;
        const disabled = item.disabled ?? false;
        return (
          <View key={item.key}>
            {index > 0 ? (
              <View
                style={[
                  styles.separator,
                  { marginLeft: theme.size.gutter, backgroundColor: theme.color.borderDefault },
                ]}
              />
            ) : null}
            <PressableScale
              accessibilityRole="radio"
              accessibilityLabel={
                item.accessibilityLabel ??
                (item.sublabel ? `${item.label}, ${item.sublabel}` : item.label)
              }
              accessibilityState={{ selected, checked: selected, disabled }}
              disabled={disabled}
              scaleTo={ROW_PRESS_SCALE}
              onPress={() => {
                haptic.selection();
                onSelect(item.key);
              }}
              style={[
                styles.row,
                {
                  minHeight: theme.size.rowWorker,
                  paddingHorizontal: theme.size.gutter,
                  paddingVertical: theme.space[2],
                  gap: theme.space[3],
                  backgroundColor: selected ? selectedBg : 'transparent',
                },
              ]}
            >
              {/* The dim sits on the content: PressableScale's animated opacity overrides an outer opacity. */}
              <View
                style={[
                  styles.text,
                  styles.row,
                  { gap: theme.space[3] },
                  disabled ? { opacity: DISABLED_OPACITY } : null,
                ]}
              >
                <View style={styles.text}>
                  <T
                    variant="body"
                    tone={item.tone === 'critical' ? 'critical' : 'primary'}
                    weight={selected ? 'semibold' : undefined}
                  >
                    {item.label}
                  </T>
                  {item.sublabel ? (
                    <T variant="callout" tone="secondary">
                      {item.sublabel}
                    </T>
                  ) : null}
                </View>
                {selected ? (
                  <T
                    variant="headline"
                    color={theme.color.bgAccent}
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                  >
                    ✓
                  </T>
                ) : null}
              </View>
            </PressableScale>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  separator: { height: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center' },
  text: { flex: 1 },
});
