import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { useTheme } from '@/lib/theme';

import { KEYCAP_HEIGHT, KEYCAP_WIDTH, Keycap } from './Keycap';

const DIGIT_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
] as const;
const COLUMNS = 3;

export interface KeypadProps {
  onDigit: (d: string) => void;
  onErase: () => void;
  onNext: () => void;
  /** «Стереть», passed by the screen through t(). */
  eraseLabel: string;
  /** «Далее», passed by the screen through t(). */
  nextLabel: string;
  nextDisabled?: boolean;
  eraseDisabled?: boolean;
  /** Width the grid may take; defaults to the window width minus the 16 px gutters. */
  availableWidth?: number;
}

/**
 * PIN keypad: 3 × 4 grid of keycaps about 104 × 72 with 12 gaps, centered.
 * Rows 1 2 3 / 4 5 6 / 7 8 9 / erase 0 next. On narrow screens the keys scale down but never under 56 high.
 */
export function Keypad({
  onDigit,
  onErase,
  onNext,
  eraseLabel,
  nextLabel,
  nextDisabled = false,
  eraseDisabled = false,
  availableWidth,
}: KeypadProps) {
  const theme = useTheme();
  const screen = useWindowDimensions();

  const fullGap = theme.space[3];
  const fullWidth = COLUMNS * KEYCAP_WIDTH + (COLUMNS - 1) * fullGap;
  const avail = availableWidth ?? screen.width - 2 * theme.size.gutter;
  const scale = Math.min(1, Math.max(0, avail) / fullWidth);
  const gap = Math.max(theme.space[2], Math.round(fullGap * scale));
  const keyWidth = Math.floor((Math.min(avail, fullWidth) - (COLUMNS - 1) * gap) / COLUMNS);
  const keyHeight = Math.max(theme.size.tapMin, Math.round(KEYCAP_HEIGHT * scale));
  const key = { width: keyWidth, height: keyHeight };

  return (
    <View style={[styles.grid, { gap }]}>
      {DIGIT_ROWS.map((row) => (
        <View key={row.join('')} style={[styles.row, { gap }]}>
          {row.map((d) => (
            <Keycap key={d} label={d} kind="digit" onPress={() => onDigit(d)} {...key} />
          ))}
        </View>
      ))}
      <View style={[styles.row, { gap }]}>
        <Keycap
          label={eraseLabel}
          kind="text"
          onPress={onErase}
          disabled={eraseDisabled}
          {...key}
        />
        <Keycap label="0" kind="digit" onPress={() => onDigit('0')} {...key} />
        <Keycap
          label={nextLabel}
          kind="text"
          variant="inverse"
          onPress={onNext}
          disabled={nextDisabled}
          {...key}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { alignSelf: 'center', alignItems: 'center' },
  row: { flexDirection: 'row' },
});
