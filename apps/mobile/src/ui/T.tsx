import type { TypeVariant } from '@rota/design';
import { Text, type TextProps, type TextStyle } from 'react-native';

import { useTheme } from '@/lib/theme';

export type TextTone = 'primary' | 'secondary' | 'disabled' | 'critical' | 'inverse' | 'onAccent' | 'accent';

export interface TProps extends TextProps {
  variant?: TypeVariant;
  tone?: TextTone;
  /** Overrides the tone with a raw theme color, for status tinted labels. */
  color?: string;
  align?: TextStyle['textAlign'];
  weight?: 'medium' | 'semibold' | 'bold';
}

/** Text with a type variant (PHASE_0 §6.4) and a tone. All copy goes through `t()` before it reaches here. */
export function T({ variant = 'body', tone = 'primary', color, align, weight, style, ...rest }: TProps) {
  const theme = useTheme();
  const toneColor: Record<TextTone, string> = {
    primary: theme.color.textPrimary,
    secondary: theme.color.textSecondary,
    disabled: theme.color.textDisabled,
    critical: theme.status.critical,
    inverse: theme.color.textInverse,
    onAccent: theme.color.textOnAccent,
    accent: theme.color.textAccent,
  };
  const v = theme.type[variant];
  const family = weight
    ? v.fontFamily.startsWith('GeistMono')
      ? 'GeistMono_500Medium'
      : { medium: 'Inter_500Medium', semibold: 'Inter_600SemiBold', bold: 'Inter_700Bold' }[weight]
    : v.fontFamily;
  return (
    <Text
      maxFontSizeMultiplier={1.4}
      {...rest}
      style={[v, { fontFamily: family, color: color ?? toneColor[tone] }, align ? { textAlign: align } : null, style]}
    />
  );
}
