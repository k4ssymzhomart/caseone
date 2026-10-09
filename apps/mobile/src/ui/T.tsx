import { emphasis, fontFamily, type TypeVariant } from '@rota/design';
import { Text, type TextProps, type TextStyle } from 'react-native';

import { useTheme } from '@/lib/theme';

import { useFitText } from './fitText';

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
    // Red 500 is under 4.5:1 on white (PHASE_0 §6.2), so light mode sets critical text in the darker accent red.
    critical: theme.mode === 'light' ? theme.color.textAccent : theme.status.critical,
    inverse: theme.color.textInverse,
    onAccent: theme.color.textOnAccent,
    accent: theme.color.textAccent,
  };
  const v = theme.type[variant];
  // Android ignores fontWeight on custom fonts, so a weight picks the face: Geist Mono has one heavier cut.
  const mono = v.fontFamily === fontFamily.mono || v.fontFamily === fontFamily.monoMedium;
  const family = weight ? (mono ? fontFamily.monoMedium : emphasis[weight]) : v.fontFamily;
  const fit = useFitText(rest.adjustsFontSizeToFit === true && rest.numberOfLines === 1, rest.minimumFontScale, v.fontSize);
  return (
    <Text
      maxFontSizeMultiplier={1.4}
      {...rest}
      {...(fit.ref ? { ref: fit.ref as never } : {})}
      style={[
        v,
        { fontFamily: family, color: color ?? toneColor[tone] },
        align ? { textAlign: align } : null,
        style,
        fit.style,
      ]}
    />
  );
}
