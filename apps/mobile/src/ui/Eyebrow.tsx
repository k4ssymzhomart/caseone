import type { ReactNode } from 'react';
import type { TextProps } from 'react-native';

import { T, type TextTone } from './T';

export interface EyebrowProps extends Omit<TextProps, 'children'> {
  children: ReactNode;
  /** Secondary by default; critical for «№147 · АВАРИЙНЫЙ» style eyebrows. */
  tone?: TextTone;
  /** Raw theme color, overrides the tone (for status tinted eyebrows). */
  color?: string;
  align?: 'left' | 'center' | 'right';
}

/** Mono caps eyebrow above titles and inside cards (PHASE_0 §6.4 `monoCaps`). */
export function Eyebrow({ children, tone = 'secondary', color, align, ...rest }: EyebrowProps) {
  return (
    <T variant="monoCaps" tone={tone} color={color} align={align} numberOfLines={1} {...rest}>
      {children}
    </T>
  );
}
