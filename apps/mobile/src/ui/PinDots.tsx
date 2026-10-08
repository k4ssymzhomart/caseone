import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';
import { useTheme } from '@/lib/theme';

/** PIN dots are 14 px (PHASE_0 §6.9). */
const DOT = 14;
/** Outline of an empty dot. */
const DOT_BORDER = 2;
/** One step of the shake; the whole shake is 8 steps (400 ms). */
const SHAKE_STEP_MS = 50;
const SHAKE_MS = SHAKE_STEP_MS * 8;
/** The dots stay red a little longer than the shake. */
const ERROR_TINT_MS = SHAKE_MS + 200;

export type PinDotsTone = 'default' | 'critical';

export interface PinDotsProps {
  /** Number of dots, 4 by default. */
  length?: number;
  /** How many dots are filled. */
  filled: number;
  /** Change it to a new non null value (a counter or a timestamp) to shake the dots with an error haptic. */
  errorKey?: string | number | null;
  /** `critical` tints the dots red; they also turn red by themselves during the error shake. */
  tone?: PinDotsTone;
  /** For example «Введено 2 из 4», passed by the screen. */
  accessibilityLabel?: string;
}

/** PIN progress dots: filled textPrimary, empty with a borderStrong outline; shakes on a wrong PIN. */
export function PinDots({
  length = 4,
  filled,
  errorKey = null,
  tone = 'default',
  accessibilityLabel,
}: PinDotsProps) {
  const theme = useTheme();
  const reduce = useReducedMotion();
  const x = useSharedValue(0);
  const [erroring, setErroring] = useState(false);
  const prevKey = useRef<string | number | null>(errorKey);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shakeDistance = theme.space[2];

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  useEffect(() => {
    const next = errorKey ?? null;
    if (next === null || next === prevKey.current) {
      prevKey.current = next;
      return;
    }
    prevKey.current = next;
    haptic.error();
    setErroring(true);
    if (!reduce) {
      x.value = withSequence(
        withTiming(-shakeDistance, { duration: SHAKE_STEP_MS }),
        withRepeat(withTiming(shakeDistance, { duration: SHAKE_STEP_MS * 2 }), 3, true),
        withTiming(0, { duration: SHAKE_STEP_MS }),
      );
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setErroring(false), ERROR_TINT_MS);
  }, [errorKey, reduce, shakeDistance, x]);

  const shake = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  const critical = tone === 'critical' || erroring;
  const fillColor = critical ? theme.status.critical : theme.color.textPrimary;
  const outlineColor = critical ? theme.status.critical : theme.color.borderStrong;
  const count = Math.max(0, Math.floor(length));

  return (
    <Animated.View
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel}
      accessibilityLiveRegion="polite"
      style={[styles.row, { gap: theme.space[4] }, shake]}
    >
      {Array.from({ length: count }, (_, i) => {
        const on = i < filled;
        return (
          <View
            key={i}
            style={[
              styles.dot,
              {
                borderRadius: theme.radius.full,
                borderColor: on ? fillColor : outlineColor,
                backgroundColor: on ? fillColor : 'transparent',
              },
            ]}
          />
        );
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  dot: { width: DOT, height: DOT, borderWidth: DOT_BORDER },
});
