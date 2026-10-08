import { lockupSymbolPath, lockupWordmarkPath } from '@rota/design';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '@/lib/theme';

/** The lockup's art box from Rota's brand files (PHASE_0 §6.9: 165 × 50). */
const VIEWBOX_W = 165;
const VIEWBOX_H = 50;
/** Default lockup height. */
const DEFAULT_HEIGHT = 24;

export interface LockupProps {
  /** Default 24; the width follows at 165 / 50. */
  height?: number;
  /** Wordmark color, `theme.color.textPrimary` by default. The mark stays red (`bgBrand`). */
  color?: string;
  /** The brand name for screen readers, passed in by the screen. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/** Mark and wordmark side by side. */
export function Lockup({ height = DEFAULT_HEIGHT, color, accessibilityLabel, style }: LockupProps) {
  const theme = useTheme();
  const labelled = Boolean(accessibilityLabel);
  return (
    <Svg
      width={(height * VIEWBOX_W) / VIEWBOX_H}
      height={height}
      viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
      style={style}
      accessible={labelled}
      accessibilityRole={labelled ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={!labelled}
      importantForAccessibility={labelled ? 'yes' : 'no-hide-descendants'}
    >
      <Path d={lockupSymbolPath} fill={theme.color.bgBrand} />
      <Path
        d={lockupWordmarkPath}
        fill={color ?? theme.color.textPrimary}
        fillRule="evenodd"
        clipRule="evenodd"
      />
    </Svg>
  );
}
