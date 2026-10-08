import { markPath } from '@rota/design';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '@/lib/theme';

/** The mark's art box from Rota's brand files (PHASE_0 §6.9). */
const VIEWBOX = 100;
/** Default mark size; the HUD passes 16 (PHASE_0 §6.9). */
const DEFAULT_SIZE = 20;

export interface LogoMarkProps {
  /** Default 20; the HUD uses 16. */
  size?: number;
  /** Describe the mark when it stands alone. Leave empty when it sits next to text. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/** The Rota mark: four petals around a turn. Always red, in both modes (`bgBrand`). */
export function LogoMark({ size = DEFAULT_SIZE, accessibilityLabel, style }: LogoMarkProps) {
  const theme = useTheme();
  const labelled = Boolean(accessibilityLabel);
  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
      style={style}
      accessible={labelled}
      accessibilityRole={labelled ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={!labelled}
      importantForAccessibility={labelled ? 'yes' : 'no-hide-descendants'}
    >
      <Path d={markPath} fill={theme.color.bgBrand} />
    </Svg>
  );
}
