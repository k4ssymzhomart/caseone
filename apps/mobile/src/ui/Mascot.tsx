import { mascotColors, mascots, type MascotName } from '@rota/design';
import { useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { G, Path } from 'react-native-svg';

import { useTheme } from '@/lib/theme';

/** The mascot art box from Rota's brand files (PHASE_0 §6.9: viewBox 240). */
const VIEWBOX = 240;
/** Default size, inside the 96 to 160 range of PHASE_0 §6.11. */
const DEFAULT_SIZE = 120;
/** Entrance: fade in from scale 0.9 (PHASE_0 §6.9). */
const FROM_SCALE = 0.9;
const ENTER_MS = 320;
const ENTER_REDUCED_MS = 160;

export interface MascotProps {
  name: MascotName;
  /** 96 to 160 on screens (PHASE_0 §6.11). Default 120. */
  size?: number;
  /** Describe the mascot when it carries meaning. Leave empty for decoration. */
  accessibilityLabel?: string;
  /** Skip the entrance animation (static kit tiles, lists). */
  still?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** A Rota mascot: one path per layer, colored for the current mode. Fades in at scale 0.9 → 1. */
export function Mascot({ name, size = DEFAULT_SIZE, accessibilityLabel, still = false, style }: MascotProps) {
  const theme = useTheme();
  const reduce = useReducedMotion();
  const progress = useSharedValue(still ? 1 : 0);
  const data = mascots[name];
  const colors = mascotColors[theme.mode];

  useEffect(() => {
    if (still) {
      progress.set(1);
      return;
    }
    progress.set(0);
    progress.set(
      withTiming(1, {
        duration: reduce ? ENTER_REDUCED_MS : ENTER_MS,
        easing: Easing.out(Easing.cubic),
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [name, still, reduce, progress]);

  const animated = useAnimatedStyle(() => {
    const p = progress.get();
    return {
      opacity: p,
      transform: [{ scale: reduce ? 1 : FROM_SCALE + (1 - FROM_SCALE) * p }],
    };
  });

  const labelled = Boolean(accessibilityLabel);

  return (
    <Animated.View
      style={[{ width: size, height: size }, style, animated]}
      accessible={labelled}
      accessibilityRole={labelled ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={!labelled}
      importantForAccessibility={labelled ? 'yes' : 'no-hide-descendants'}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}>
        <G transform={`translate(${data.dx} ${data.dy})`}>
          {data.layers.map(([role, d], i) => (
            <Path key={`${role}-${i}`} d={d} fill={colors[role]} fillRule="evenodd" clipRule="evenodd" />
          ))}
        </G>
      </Svg>
    </Animated.View>
  );
}
