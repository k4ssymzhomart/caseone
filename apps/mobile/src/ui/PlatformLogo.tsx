import type { PlatformLogo as Logo } from '@rota/design';
import Svg, { Path, Text as SvgText } from 'react-native-svg';

import { useTheme } from '@/lib/theme';

/**
 * Logo sizes (docs/design.md §10): `inline` beside footnote, mono or caps text, `compact` for a short row of
 * marks at the end of a list row, `row` as a list row's left accessory (the size of an iOS settings icon).
 */
export const LOGO_SIZE = { inline: 16, compact: 20, row: 28 } as const;

export interface PlatformLogoProps {
  /** A single logo from @rota/design, e.g. telegramLogo. */
  logo: Logo;
  size?: number;
  /**
   * 'theme' (default): the brand color, white on dark where the brand is near black. 'brand': exact brand color.
   * A logo with full color artwork (Chrome, Telegram, Safari) paints it in either tone.
   */
  tone?: 'theme' | 'brand';
  /** Spoken name; omit when a visible label already names the platform. */
  accessibilityLabel?: string;
}

/** A platform or service logo (Telegram, Android, Apple…) drawn with react-native-svg. */
export function PlatformLogo({ logo, size = 24, tone = 'theme', accessibilityLabel }: PlatformLogoProps) {
  const theme = useTheme();
  const fill = tone === 'brand' || theme.mode === 'light' ? logo.brand : logo.onDark;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      accessible={Boolean(accessibilityLabel)}
      accessibilityLabel={accessibilityLabel}
    >
      {logo.art
        ? logo.art.map((part) => <Path key={part.d.slice(0, 24)} d={part.d} fill={part.color} fillRule="evenodd" />)
        : logo.paths.map((d) => <Path key={d.slice(0, 24)} d={d} fill={fill} fillRule="evenodd" />)}
      {logo.detail?.paths.map((d) => <Path key={d.slice(0, 24)} d={d} fill={logo.detail!.color} />)}
      {logo.label ? (
        <SvgText x="12" y="16" textAnchor="middle" fontWeight="700" fontSize="11" fill={logo.label.color}>
          {logo.label.text}
        </SvgText>
      ) : null}
    </Svg>
  );
}
