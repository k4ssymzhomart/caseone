import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import { formatRu } from "../data/numbers";
import { FONT } from "../theme";

/** A number that counts up from 0 in Geist Mono, then holds. Tabular digits keep the width steady. */
export const CountUp: React.FC<{
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  delay?: number;
  duration?: number;
  size: number;
  color?: string;
  suffixColor?: string;
}> = ({ value, decimals = 0, prefix = "", suffix = "", delay = 0, duration = 36, size, color = "#fff", suffixColor }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [delay, delay + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const shown = formatRu(value * p, decimals);
  return (
    <span
      style={{
        fontFamily: FONT.mono,
        fontWeight: 500,
        fontSize: size,
        lineHeight: 1,
        letterSpacing: "-0.04em",
        color,
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
      }}
    >
      {prefix}
      {shown}
      {suffix ? <span style={{ color: suffixColor ?? color, fontSize: size * 0.46, letterSpacing: "-0.01em" }}>{suffix}</span> : null}
    </span>
  );
};

/** A stopwatch that runs in real time from `start` (scene frame) beginning at `from` seconds and stops at `stop`
 * seconds: the counter on screen moves with the footage beside it. */
export const Stopwatch: React.FC<{
  start: number;
  from?: number;
  stop: number;
  decimals?: number;
  suffix?: string;
  size: number;
  color?: string;
  runningColor?: string;
}> = ({ start, from = 0, stop, decimals = 1, suffix = " с", size, color = "#fff", runningColor }) => {
  const frame = useCurrentFrame();
  const t = Math.min(stop, Math.max(0, from + (frame - start) / 30));
  const done = t >= stop;
  return (
    <span
      style={{
        fontFamily: FONT.mono,
        fontWeight: 500,
        fontSize: size,
        lineHeight: 1,
        letterSpacing: "-0.04em",
        color: done ? color : (runningColor ?? color),
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
      }}
    >
      {formatRu(done ? stop : t, decimals)}
      <span style={{ fontSize: size * 0.46, letterSpacing: "-0.01em" }}>{suffix}</span>
    </span>
  );
};
