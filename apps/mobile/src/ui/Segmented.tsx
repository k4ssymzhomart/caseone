import { useCallback, useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';
import { useTheme } from '@/lib/theme';

import { PressableScale } from './PressableScale';
import { T } from './T';

export type SegmentedTone = 'default' | 'critical';

export interface SegmentedItem<K extends string = string> {
  key: K;
  label: string;
  /** Optional mono count after the label. */
  count?: number | string;
  /** critical tints the count red («Просрочены»). */
  tone?: SegmentedTone;
  accessibilityLabel?: string;
}

export interface SegmentedProps<K extends string = string> {
  items: readonly SegmentedItem<K>[];
  value: K;
  onChange: (key: K) => void;
  /** Scroll horizontally and size segments to their content (the board's 6 columns). */
  scrollable?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

interface Box {
  x: number;
  w: number;
}

/**
 * Segmented control (PHASE_0 §6.9): height 40, muted track, pill segments with a label and a mono count.
 * The selected segment is white with the thumb shadow in light; in dark it uses bgControl, because
 * bgElevated equals the bgMuted track in the dark palette and would not show.
 */
export function Segmented<K extends string = string>({
  items,
  value,
  onChange,
  scrollable = false,
  accessibilityLabel,
  style,
  testID,
}: SegmentedProps<K>) {
  const theme = useTheme();
  const { color, space, radius } = theme;
  const reduce = useReducedMotion();

  const scrollRef = useRef<ScrollView>(null);
  const boxes = useRef(new Map<string, Box>());
  const viewW = useRef(0);

  const reveal = useCallback(
    (key: string, animated: boolean) => {
      const b = boxes.current.get(key);
      if (!scrollable || !b || viewW.current === 0) return;
      const x = Math.max(0, b.x - (viewW.current - b.w) / 2);
      scrollRef.current?.scrollTo({ x, animated });
    },
    [scrollable],
  );

  useEffect(() => {
    reveal(value, !reduce);
  }, [value, reveal, reduce]);

  const inset = space.half;
  const segH = theme.size.buttonS - inset * 2;
  // Glove mode: the 36 px segment gets a vertical slop up to tapMin.
  const slop = Math.max(0, Math.ceil((theme.size.tapMin - segH) / 2));

  const selectedStyle: ViewStyle =
    theme.mode === 'light'
      ? { backgroundColor: color.bgElevated, ...theme.shadow.thumb }
      : { backgroundColor: color.bgControl };

  const track: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    height: theme.size.buttonS,
    padding: inset,
    borderRadius: radius.full,
    backgroundColor: color.bgMuted,
  };

  const segments = items.map((item) => {
    const selected = item.key === value;
    // Light mode uses the darker accent red for text contrast, like T's critical tone.
    const critical = theme.mode === 'light' ? color.textAccent : theme.status.critical;
    const countColor = item.tone === 'critical' ? critical : color.textSecondary;
    const a11y =
      item.accessibilityLabel ?? (item.count !== undefined ? `${item.label} ${item.count}` : item.label);
    return (
      <PressableScale
        key={item.key}
        accessibilityRole="tab"
        accessibilityLabel={a11y}
        accessibilityState={{ selected }}
        hitSlop={slop > 0 ? { top: slop, bottom: slop } : undefined}
        onLayout={(e) => {
          const { x, width } = e.nativeEvent.layout;
          boxes.current.set(item.key, { x, w: width });
          if (selected) reveal(item.key, false);
        }}
        onPress={() => {
          if (selected) return;
          void haptic.selection();
          onChange(item.key);
        }}
        style={[
          styles.segment,
          {
            height: segH,
            borderRadius: radius.full,
            gap: space[2],
            paddingHorizontal: scrollable ? space[4] : space[2],
          },
          scrollable ? styles.grow : styles.fill,
          selected ? selectedStyle : null,
        ]}
      >
        <T
          variant="callout"
          weight={selected ? 'semibold' : 'medium'}
          tone={selected ? 'primary' : 'secondary'}
          numberOfLines={1}
          style={styles.label}
        >
          {item.label}
        </T>
        {item.count !== undefined ? (
          <T variant="monoM" color={countColor} numberOfLines={1}>
            {String(item.count)}
          </T>
        ) : null}
      </PressableScale>
    );
  });

  if (scrollable) {
    return (
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="tablist"
        accessibilityLabel={accessibilityLabel}
        onLayout={(e) => {
          viewW.current = e.nativeEvent.layout.width;
          reveal(value, false);
        }}
        style={[styles.scroll, style]}
        contentContainerStyle={[track, styles.grow]}
        testID={testID}
      >
        {segments}
      </ScrollView>
    );
  }

  return (
    <View accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} style={[track, style]} testID={testID}>
      {segments}
    </View>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  fill: { flex: 1 },
  grow: { flexGrow: 1 },
  label: { flexShrink: 1 },
  scroll: { flexGrow: 0 },
});
