// The typed theme for React Native (and anything else that wants plain values).
import { color as rotaColor, shape, space as rotaSpace } from './generated/tokens';
import { softAlpha, statusColors, withAlpha, type StatusColors, type StatusTone } from './extensions';
import { typography } from './typography';

export type ThemeMode = 'dark' | 'light';

type SemanticKey = keyof (typeof rotaColor)['light'];

/** `bg/accent-hover` → `bgAccentHover` */
type CamelSegment<S extends string> = S extends `${infer H}-${infer T}`
  ? `${Capitalize<H>}${CamelSegment<T>}`
  : Capitalize<S>;
type CamelToken<S extends string> = S extends `${infer G}/${infer R}` ? `${G}${CamelSegment<R>}` : S;
export type SemanticColors = { readonly [K in SemanticKey as CamelToken<K>]: string };

function camelToken(name: string): string {
  const [group, rest = ''] = name.split('/');
  return (
    group +
    rest
      .split('-')
      .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
      .join('')
  );
}

function semantic(mode: ThemeMode): SemanticColors {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(rotaColor[mode])) out[camelToken(key)] = value;
  return out as SemanticColors;
}

export const space = {
  half: rotaSpace.half,
  1: rotaSpace['1'],
  2: rotaSpace['2'],
  3: rotaSpace['3'],
  4: rotaSpace['4'],
  5: rotaSpace['5'],
  6: rotaSpace['6'],
  8: rotaSpace['8'],
  10: rotaSpace['10'],
  12: rotaSpace['12'],
  16: rotaSpace['16'],
  24: rotaSpace['24'],
} as const;

export const radius = {
  none: shape['radius/none'],
  xs: shape['radius/xs'],
  sm: shape['radius/sm'],
  md: shape['radius/md'],
  lg: shape['radius/lg'],
  xl: shape['radius/xl'],
  full: shape['radius/full'],
} as const;

/** Glove mode sizes (CLAUDE.md §4). */
export const size = {
  buttonL: 64,
  buttonM: 52,
  buttonS: 40,
  tapMin: 56,
  rowWorker: 64,
  rowMaster: 56,
  chip: 48,
  pill: 28,
  tag: 22,
  dot: 10,
  avatar: 40,
  tabBar: 64,
  hud: 44,
  gutter: 16,
} as const;

/** Light mode shadows as React Native `boxShadow` strings (dark mode uses surfaces and hairlines). */
export const shadow = {
  card: { boxShadow: '0px 20px 50px 0px rgba(0, 0, 0, 0.078), 0px 1px 3px 0px rgba(0, 0, 0, 0.059)' },
  float: { boxShadow: '0px 18px 44px 0px rgba(0, 0, 0, 0.18), 0px 2px 8px 0px rgba(0, 0, 0, 0.078)' },
  soft: { boxShadow: '0px 6px 18px 0px rgba(0, 0, 0, 0.071), 0px 1px 2px 0px rgba(0, 0, 0, 0.059)' },
  key: { boxShadow: '0px 2px 0px 0px rgba(0, 0, 0, 0.161), 0px 6px 14px 0px rgba(0, 0, 0, 0.078)' },
  thumb: { boxShadow: '0px 1px 3px 0px rgba(0, 0, 0, 0.22), 0px 2px 6px 0px rgba(0, 0, 0, 0.078)' },
} as const;
const noShadow = { card: {}, float: {}, soft: {}, key: {}, thumb: {} } as const;

export interface Theme {
  readonly mode: ThemeMode;
  readonly color: SemanticColors;
  readonly status: StatusColors;
  /** Soft fills for pills and badges, at `softAlpha[mode]`. */
  readonly statusSoft: StatusColors;
  readonly space: typeof space;
  readonly radius: typeof radius;
  readonly size: typeof size;
  readonly type: typeof typography;
  readonly shadow: { readonly [K in keyof typeof shadow]: { readonly boxShadow?: string } };
  readonly glass: {
    readonly fill: string;
    readonly fillStrong: string;
    readonly stroke: string;
    readonly tint: string;
    readonly blurIntensity: number;
  };
}

function soft(mode: ThemeMode): StatusColors {
  const out = {} as Record<StatusTone, string>;
  for (const [k, v] of Object.entries(statusColors[mode]) as [StatusTone, string][]) {
    out[k] = withAlpha(v, softAlpha[mode]);
  }
  return out;
}

function build(mode: ThemeMode): Theme {
  const color = semantic(mode);
  return {
    mode,
    color,
    status: statusColors[mode],
    statusSoft: soft(mode),
    space,
    radius,
    size,
    type: typography,
    shadow: mode === 'light' ? shadow : noShadow,
    glass: {
      fill: color.glassFill,
      fillStrong: color.glassFillStrong,
      stroke: color.glassStroke,
      tint: color.glassTint,
      blurIntensity: 40,
    },
  };
}

export const themes: Record<ThemeMode, Theme> = { dark: build('dark'), light: build('light') };

export function getTheme(mode: ThemeMode): Theme {
  return themes[mode];
}
