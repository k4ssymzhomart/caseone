// Type and entrance motion in the Rota style: Inter headlines, Geist Mono eyebrows, red accents.
import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import { C, FONT, T, ease } from "../theme";

const OUT = Easing.bezier(...ease.out);

/** 0 → 1 progress of an entrance that starts at `delay` frames and lasts `duration` frames. */
export const useIn = (delay = 0, duration = 18): number => {
  const frame = useCurrentFrame();
  return interpolate(frame, [delay, delay + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: OUT,
  });
};

/** 1 → 0 progress of an exit that starts at `at` frames. */
export const useOut = (at: number, duration = 12): number => {
  const frame = useCurrentFrame();
  return interpolate(frame, [at, at + duration], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(...ease.inOut),
  });
};

/** Fades and lifts its children into their layout slot. */
export const Reveal: React.FC<{
  delay?: number;
  duration?: number;
  distance?: number;
  exitAt?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ delay = 0, duration = 18, distance = 28, exitAt, style, children }) => {
  const p = useIn(delay, duration);
  const out = useOut(exitAt ?? 1e9);
  return (
    <div style={{ opacity: p * out, translate: `0 ${(1 - p) * distance}px`, ...style }}>{children}</div>
  );
};

export const Eyebrow: React.FC<{ children: React.ReactNode; color?: string; dot?: boolean; size?: number }> = ({
  children,
  color = C.red400,
  dot = true,
  size = T.eyebrow,
}) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 14,
      fontFamily: FONT.mono,
      fontWeight: 500,
      fontSize: size,
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      color,
    }}
  >
    {dot ? <span style={{ width: size * 0.42, height: size * 0.42, borderRadius: 99, background: C.red }} /> : null}
    <span>{children}</span>
  </div>
);

export const Headline: React.FC<{ children: React.ReactNode; size?: number; color?: string; style?: React.CSSProperties }> = ({
  children,
  size = T.headline,
  color = C.text,
  style,
}) => (
  <div
    style={{
      fontFamily: FONT.sans,
      fontWeight: 700,
      fontSize: size,
      lineHeight: 1.04,
      letterSpacing: "-0.035em",
      color,
      textWrap: "balance",
      ...style,
    }}
  >
    {children}
  </div>
);

export const Lead: React.FC<{ children: React.ReactNode; size?: number; color?: string; style?: React.CSSProperties }> = ({
  children,
  size = T.body,
  color = C.text2,
  style,
}) => (
  <div
    style={{
      fontFamily: FONT.sans,
      fontWeight: 400,
      fontSize: size,
      lineHeight: 1.32,
      letterSpacing: "-0.01em",
      color,
      textWrap: "pretty",
      ...style,
    }}
  >
    {children}
  </div>
);

export const Mono: React.FC<{ children: React.ReactNode; size?: number; color?: string; weight?: number; style?: React.CSSProperties }> = ({
  children,
  size = T.label,
  color = C.text,
  weight = 500,
  style,
}) => (
  <span style={{ fontFamily: FONT.mono, fontWeight: weight, fontSize: size, color, letterSpacing: "-0.01em", ...style }}>
    {children}
  </span>
);

/** Status is never color alone: a dot plus a word (CLAUDE.md §4). */
export const StatusPill: React.FC<{ color: string; children: React.ReactNode; size?: number }> = ({
  color,
  children,
  size = 26,
}) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: size * 0.4,
      padding: `${size * 0.3}px ${size * 0.62}px`,
      borderRadius: 999,
      background: `${color}38`,
      fontFamily: FONT.sans,
      fontWeight: 600,
      fontSize: size,
      color: C.text,
      whiteSpace: "nowrap",
    }}
  >
    <span style={{ width: size * 0.42, height: size * 0.42, borderRadius: 99, background: color }} />
    {children}
  </span>
);

/** A check row with the app's glyphs: ✓ pass, ! warn, ✕ fail. */
export const CheckRow: React.FC<{ kind: "pass" | "warn" | "fail"; title: React.ReactNode; detail?: React.ReactNode; size?: number }> = ({
  kind,
  title,
  detail,
  size = 34,
}) => {
  const tone = kind === "pass" ? C.free : kind === "warn" ? C.warning : C.red;
  const glyph = kind === "pass" ? "✓" : kind === "warn" ? "!" : "✕";
  return (
    <div style={{ display: "flex", gap: size * 0.55, alignItems: "flex-start" }}>
      <span
        style={{
          flex: "none",
          width: size * 1.15,
          height: size * 1.15,
          borderRadius: 99,
          background: `${tone}30`,
          color: tone,
          display: "grid",
          placeItems: "center",
          fontFamily: FONT.sans,
          fontWeight: 700,
          fontSize: size * 0.68,
          marginTop: size * 0.05,
        }}
      >
        {glyph}
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontFamily: FONT.sans, fontWeight: 600, fontSize: size, color: C.text, lineHeight: 1.2 }}>{title}</span>
        {detail ? (
          <span style={{ fontFamily: FONT.sans, fontSize: size * 0.78, color: C.text2, lineHeight: 1.3 }}>{detail}</span>
        ) : null}
      </div>
    </div>
  );
};

export const Glass: React.FC<{ children: React.ReactNode; style?: React.CSSProperties; strong?: boolean }> = ({
  children,
  style,
  strong = false,
}) => (
  <div
    style={{
      background: strong ? C.glassStrong : C.glass,
      border: `1px solid ${C.hairlineStrong}`,
      borderRadius: 28,
      boxShadow: "0 30px 80px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)",
      ...style,
    }}
  >
    {children}
  </div>
);
