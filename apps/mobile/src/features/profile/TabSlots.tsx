import { View } from 'react-native';

import { useTheme } from '@/lib/theme';
import { T } from '@/ui/T';

export interface TabSlotsProps {
  /** Digits typed so far. */
  value: string;
  length?: number;
  /** «Введено цифр: 2 из 4», passed by the screen. */
  accessibilityLabel?: string;
}

/** The табельный номер as boxes with one monoL digit each; the next empty box carries the focus outline. */
export function TabSlots({ value, length = 4, accessibilityLabel }: TabSlotsProps) {
  const theme = useTheme();
  const box = theme.size.tapMin;
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel}
      accessibilityLiveRegion="polite"
      style={{ flexDirection: 'row', justifyContent: 'center', gap: theme.space[3] }}
    >
      {Array.from({ length }, (_, i) => {
        const digit = value[i];
        const focus = i === value.length;
        return (
          <View
            key={i}
            style={{
              width: box - theme.space[2],
              height: box,
              borderRadius: theme.radius.md,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.color.bgSubtle,
              borderWidth: focus ? 2 : 1,
              borderColor: focus ? theme.color.borderFocus : theme.color.borderDefault,
            }}
          >
            <T variant="monoL">{digit ?? ''}</T>
          </View>
        );
      })}
    </View>
  );
}
