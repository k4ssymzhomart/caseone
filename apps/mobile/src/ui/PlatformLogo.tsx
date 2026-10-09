import type { PlatformLogo as Logo } from '@rota/design';
import Svg, { Path, Text as SvgText } from 'react-native-svg';

import { useTheme } from '@/lib/theme';

export interface PlatformLogoProps {
  /** A single logo from @rota/design, e.g. telegramLogo. */
  logo: Logo;
  size?: number;
  /** 'theme' (default): the brand color, white on dark where the brand is near black. 'brand': exact brand color. */
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
      {logo.paths.map((d) => (
        <Path key={d.slice(0, 24)} d={d} fill={fill} fillRule="evenodd" />
      ))}
      {logo.detail?.paths.map((d) => <Path key={d.slice(0, 24)} d={d} fill={logo.detail!.color} />)}
      {logo.label ? (
        <SvgText x="12" y="16" textAnchor="middle" fontWeight="700" fontSize="11" fill={logo.label.color}>
          {logo.label.text}
        </SvgText>
      ) : null}
    </Svg>
  );
}
