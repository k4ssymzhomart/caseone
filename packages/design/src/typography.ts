// Mobile type scale (PHASE_0 §6.4). Inter stands in for SF Pro, Geist Mono comes from Rota.
// Every variant names the exact font family per weight, because Android ignores fontWeight on custom fonts.

export const fontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  mono: 'GeistMono_400Regular',
  monoMedium: 'GeistMono_500Medium',
} as const;

export interface TextVariant {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly letterSpacing: number;
  readonly textTransform?: 'uppercase';
}

export const typography = {
  largeTitle: { fontFamily: fontFamily.bold, fontSize: 34, lineHeight: 40, letterSpacing: -0.68 },
  title1: { fontFamily: fontFamily.bold, fontSize: 28, lineHeight: 34, letterSpacing: -0.56 },
  title2: { fontFamily: fontFamily.semibold, fontSize: 22, lineHeight: 28, letterSpacing: -0.33 },
  headline: { fontFamily: fontFamily.semibold, fontSize: 19, lineHeight: 24, letterSpacing: -0.19 },
  bodyL: { fontFamily: fontFamily.regular, fontSize: 19, lineHeight: 28, letterSpacing: -0.1 },
  body: { fontFamily: fontFamily.regular, fontSize: 17, lineHeight: 24, letterSpacing: -0.03 },
  callout: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 20, letterSpacing: 0 },
  footnote: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 18, letterSpacing: 0 },
  buttonL: { fontFamily: fontFamily.semibold, fontSize: 18, lineHeight: 22, letterSpacing: -0.09 },
  buttonM: { fontFamily: fontFamily.semibold, fontSize: 16, lineHeight: 20, letterSpacing: -0.08 },
  monoDisplay: { fontFamily: fontFamily.monoMedium, fontSize: 48, lineHeight: 56, letterSpacing: -0.96 },
  monoL: { fontFamily: fontFamily.monoMedium, fontSize: 20, lineHeight: 28, letterSpacing: 0 },
  monoM: { fontFamily: fontFamily.mono, fontSize: 15, lineHeight: 20, letterSpacing: 0 },
  monoCaps: {
    fontFamily: fontFamily.monoMedium,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.72,
    textTransform: 'uppercase',
  },
} as const satisfies Record<string, TextVariant>;

export type TypeVariant = keyof typeof typography;

/** Bold and semibold faces for inline emphasis inside a variant. */
export const emphasis = {
  medium: fontFamily.medium,
  semibold: fontFamily.semibold,
  bold: fontFamily.bold,
} as const;
