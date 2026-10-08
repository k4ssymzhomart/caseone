import { useEffect } from 'react';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';
import { useTheme } from '@/lib/theme';

import { PressableScale } from './PressableScale';

// PHASE_0 §6.9 Switch: the Rota capsule, 51 × 31, thumb inset 2.
const TRACK_W = 51;
const TRACK_H = 31;
const INSET = 2;
const THUMB = TRACK_H - INSET * 2;
const TRAVEL = TRACK_W - THUMB - INSET * 2;
const DISABLED_OPACITY = 0.4;
// Rota web switch curve: a small overshoot, cubic-bezier(0.3, 1.4, 0.6, 1).
const DURATION = 200;
const EASING = Easing.bezier(0.3, 1.4, 0.6, 1);

export interface SwitchProps {
  value: boolean;
  onValueChange?: (next: boolean) => void;
  disabled?: boolean;
  /** Required: a switch has no visible label of its own (pass the row title). */
  accessibilityLabel: string;
  testID?: string;
}

/** Rota capsule switch: red when on, control gray when off, white thumb (PHASE_0 §6.9). */
export function Switch({ value, onValueChange, disabled = false, accessibilityLabel, testID }: SwitchProps) {
  const theme = useTheme();
  const reduce = useReducedMotion();
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    const target = value ? 1 : 0;
    progress.value = reduce ? target : withTiming(target, { duration: DURATION, easing: EASING });
  }, [value, reduce, progress]);

  const off = theme.color.bgControl;
  const on = theme.color.bgAccent;

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(Math.min(1, Math.max(0, progress.value)), [0, 1], [off, on]),
  }));
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * TRAVEL }],
  }));

  // Glove mode: extend the 51 × 31 capsule to a tapMin square target.
  const slopV = Math.ceil((theme.size.tapMin - TRACK_H) / 2);
  const slopH = Math.max(0, Math.ceil((theme.size.tapMin - TRACK_W) / 2));

  return (
    <PressableScale
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      hitSlop={{ top: slopV, bottom: slopV, left: slopH, right: slopH }}
      onPress={() => {
        void haptic.selection();
        onValueChange?.(!value);
      }}
      testID={testID}
    >
      <Animated.View
        style={[
          {
            width: TRACK_W,
            height: TRACK_H,
            padding: INSET,
            borderRadius: theme.radius.full,
          },
          trackStyle,
          disabled ? { opacity: DISABLED_OPACITY } : null,
        ]}
      >
        <Animated.View
          style={[
            {
              width: THUMB,
              height: THUMB,
              borderRadius: theme.radius.full,
              // White in both modes, on the red track and on the gray one.
              backgroundColor: theme.color.textOnAccent,
            },
            theme.shadow.thumb,
            thumbStyle,
          ]}
        />
      </Animated.View>
    </PressableScale>
  );
}
