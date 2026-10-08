// Chart styling helper (recharts). Every chart in the panel takes its look from here, so they read as one system:
// thin bars with 4 px rounded data ends, a 2 px surface gap between stacked segments, hairline grid, mono ticks in
// the secondary text color, an HTML tooltip and legend in text tokens (text never wears the series color).
//
//   import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
//   import { ChartCard, ChartTooltip } from '@/components/chart';
//   import { gridProps, stackedBarProps, tooltipProps, xAxisProps, yAxisProps, series } from '@/lib/chart';
//
//   <ChartCard title="Рейтинг по компонентам" legend={COMPONENTS.map((c, i) => ({ label: c.label, color: series(i) }))}>
//     <BarChart data={rows} layout="vertical">
//       <CartesianGrid {...gridProps} horizontal={false} vertical />
//       <XAxis {...xAxisProps} type="number" />
//       <YAxis {...yAxisProps} type="category" dataKey="name" width={140} />
//       <Tooltip {...tooltipProps} content={(p) => <ChartTooltip {...p} format={(v) => formatNumber(v)} />} />
//       {COMPONENTS.map((c, i) => <Bar key={c.key} dataKey={c.key} name={c.label} {...stackedBarProps(i, COMPONENTS.length, 'horizontal')} />)}
//     </BarChart>
//   </ChartCard>
//
// Colors are CSS variables (set per theme by styles/themeVars.ts), so a theme switch needs no re-render.
// Rules (dataviz): a series keeps its slot whatever the filter shows (color follows the entity, never its rank);
// at most 7 categorical series, past that fold into «Другое»; one y axis only; status colors (statusColor) are for
// states and verdicts with a word next to them, never for «series 4»; light mode slots 3 to 5 sit under 3:1 on
// white, so a chart that uses them also shows the numbers in a table or in direct labels.

import type { CSSProperties } from 'react';
import type { StatusTone } from '@rota/design';

/**
 * Categorical slots in a fixed order, validated with the dataviz palette validator on the Rota chart surfaces
 * (light #ffffff, dark #161617): every adjacent pair clears the CVD and normal vision floors in both modes.
 * Red is left out on purpose: in Rota red means critical.
 */
export const CHART_PALETTE = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9'],
} as const;

export const CHART_SLOTS = CHART_PALETTE.light.length;

/** The color of categorical slot `i` (0 based) as a CSS variable. */
export function series(i: number): string {
  return `var(--chart-${(Math.max(0, Math.trunc(i)) % CHART_SLOTS) + 1})`;
}

/** A status tone as a CSS variable: free, working, queue, off, critical, success, warning, info. */
export function statusColor(tone: StatusTone): string {
  return `var(--status-${tone === 'onWorking' ? 'on-working' : tone})`;
}

/** Single series magnitude color (sequential use, one hue). */
export const CHART_PRIMARY = series(0);

export const chartTokens = {
  /** The card a chart sits on; also the stacked segment gap color. */
  surface: 'var(--color-bg-subtle)',
  grid: 'var(--color-border-default)',
  axis: 'var(--color-border-strong)',
  text: 'var(--color-text-secondary)',
  textPrimary: 'var(--color-text-primary)',
  cursor: 'var(--color-bg-muted)',
  fontMono: 'var(--font-mono)',
  fontSans: 'var(--font-sans)',
} as const;

const tick = { fill: chartTokens.text, fontSize: 12, fontFamily: chartTokens.fontMono } as const;

/** <XAxis {...xAxisProps} />: baseline in border strong, no tick marks, mono ticks. */
export const xAxisProps = {
  stroke: chartTokens.axis,
  tickLine: false,
  axisLine: { stroke: chartTokens.axis },
  tick,
  tickMargin: 8,
  minTickGap: 12,
} as const;

/** <YAxis {...yAxisProps} />: no axis line (the grid carries the scale), mono ticks, allowDecimals off. */
export const yAxisProps = {
  stroke: chartTokens.axis,
  tickLine: false,
  axisLine: false,
  tick,
  tickMargin: 8,
  width: 44,
  allowDecimals: false,
} as const;

/** <CartesianGrid {...gridProps} />: hairline, solid, horizontal lines only. */
export const gridProps = {
  stroke: chartTokens.grid,
  strokeWidth: 1,
  vertical: false,
} as const;

/** <Tooltip {...tooltipProps} content={(p) => <ChartTooltip {...p} />} />: a muted band under the hovered category. */
export const tooltipProps = {
  cursor: { fill: chartTokens.cursor, fillOpacity: 0.6 },
  isAnimationActive: false,
  wrapperStyle: { outline: 'none', zIndex: 5 } satisfies CSSProperties,
} as const;

/** Bars are at most 24 px thick and grow from one baseline. */
export const BAR_MAX = 24;
const END_RADIUS = 4;

type Orientation = 'vertical' | 'horizontal';

/** A single bar series: rounded data end, square at the baseline. 'horizontal' for layout="vertical" charts. */
export function barProps(slot = 0, orientation: Orientation = 'vertical') {
  return {
    fill: series(slot),
    maxBarSize: BAR_MAX,
    radius: endRadius(orientation),
    isAnimationActive: animate(),
  };
}

/**
 * Segment `i` of `count` in one stack: the slot color, a 2 px surface gap between segments, and the rounded end
 * only on the last segment. All segments share stackId 'stack'.
 */
export function stackedBarProps(i: number, count: number, orientation: Orientation = 'vertical') {
  return {
    stackId: 'stack',
    fill: series(i),
    stroke: chartTokens.surface,
    strokeWidth: 2,
    maxBarSize: BAR_MAX,
    radius: i === count - 1 ? endRadius(orientation) : ([0, 0, 0, 0] as [number, number, number, number]),
    isAnimationActive: animate(),
  };
}

/** A line series: 2 px, round joins, no resting dots, an 8 px active dot ringed in the surface color. */
export function lineProps(slot = 0) {
  return {
    type: 'monotone' as const,
    stroke: series(slot),
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    dot: false,
    activeDot: { r: 4, fill: series(slot), stroke: chartTokens.surface, strokeWidth: 2 },
    isAnimationActive: animate(),
  };
}

/** Area wash under a line: the series hue at 10 %. */
export function areaProps(slot = 0) {
  return { ...lineProps(slot), fill: series(slot), fillOpacity: 0.1 };
}

function endRadius(orientation: Orientation): [number, number, number, number] {
  // [top left, top right, bottom right, bottom left]
  return orientation === 'vertical' ? [END_RADIUS, END_RADIUS, 0, 0] : [0, END_RADIUS, END_RADIUS, 0];
}

function animate(): boolean {
  try {
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Default chart height in px; ChartCard uses it. */
export const CHART_HEIGHT = 280;
