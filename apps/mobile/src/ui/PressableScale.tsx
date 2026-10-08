import type { ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps extends Omit<PressableProps, 'style' | 'children'> {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  /** Pressed scale, 0.98 by default (PHASE_0 §6.8). */
  scaleTo?: number;
  pressedOpacity?: number;
}

/** Press feedback for every tappable surface: scale 0.98 for 120 ms, reduce motion respected. */
export function PressableScale({
  style,
  children,
  scaleTo = 0.98,
  pressedOpacity = 0.92,
  onPressIn,
  onPressOut,
  disabled,
  ...rest
}: PressableScaleProps) {
  const reduce = useReducedMotion();
  const pressed = useSharedValue(0);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: reduce ? 1 : 1 - (1 - scaleTo) * pressed.value }],
    opacity: 1 - (1 - pressedOpacity) * pressed.value,
  }));
  return (
    <AnimatedPressable
      accessibilityRole="button"
      disabled={disabled}
      {...rest}
      onPressIn={(e) => {
        pressed.value = withTiming(1, { duration: 120 });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.value = withTiming(0, { duration: 120 });
        onPressOut?.(e);
      }}
      style={[style, animated]}
    >
      {children}
    </AnimatedPressable>
  );
}
