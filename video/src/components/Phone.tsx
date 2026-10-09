// A clean phone frame for the portrait screen recordings (1206 × 2622 from the simulators), with the stills as the
// fallback. Taps and HUD toasts are drawn only over stills: a real recording already shows them.
import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { footageFor } from "../data/footage";
import { FootagePlayer } from "./Footage";
import type { StillName } from "../data/stills";
import { C, FONT, ease } from "../theme";

export type Tap = { at: number; x: number; y: number };
export type Shot = { still: StillName; at: number; taps?: Tap[] };
export type HudToast = { at: number; until?: number; title: string; body: string; tone?: "critical" | "warning" | "info" };

const SCREEN_ASPECT = 1206 / 2622;

const ShotLayer: React.FC<{ shot: Shot; next?: Shot }> = ({ shot, next }) => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [shot.at, shot.at + 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  if (frame < shot.at) return null;
  if (next && frame > next.at + 10) return null;
  const settle = interpolate(frame, [shot.at, shot.at + 16], [1.025, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(...ease.out),
  });
  return (
    <AbsoluteFill style={{ opacity: shot.at === 0 ? 1 : fadeIn }}>
      <Img
        src={staticFile(`stills/${shot.still}`)}
        style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top", scale: String(settle) }}
      />
    </AbsoluteFill>
  );
};

export const TapRipple: React.FC<{ tap: Tap }> = ({ tap }) => {
  const frame = useCurrentFrame();
  const t = frame - tap.at;
  if (t < -6 || t > 22) return null;
  const press = interpolate(t, [-6, 0, 4], [0, 1, 0.85], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ring = interpolate(t, [0, 22], [0.4, 1.9], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.quad) });
  const ringOpacity = interpolate(t, [0, 22], [0.9, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const dotOpacity = interpolate(t, [-6, -2, 10, 18], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", left: `${tap.x * 100}%`, top: `${tap.y * 100}%`, width: 0, height: 0 }}>
      <div
        style={{
          position: "absolute",
          left: -34,
          top: -34,
          width: 68,
          height: 68,
          borderRadius: 99,
          border: "3px solid rgba(255,255,255,0.95)",
          scale: String(ring),
          opacity: ringOpacity,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: -26,
          top: -26,
          width: 52,
          height: 52,
          borderRadius: 99,
          background: "rgba(255,255,255,0.55)",
          boxShadow: "0 0 0 2px rgba(255,59,48,0.9), 0 6px 18px rgba(0,0,0,0.5)",
          scale: String(press),
          opacity: dotOpacity,
        }}
      />
    </div>
  );
};

/** The app's HUD capsule toast, sliding down from the top of the screen. */
const Toast: React.FC<{ toast: HudToast; width: number }> = ({ toast, width }) => {
  const frame = useCurrentFrame();
  const t = frame - toast.at;
  const until = toast.until ?? toast.at + 120;
  if (t < 0 || frame > until + 14) return null;
  const inP = interpolate(t, [0, 14], [0, 1], { extrapolateRight: "clamp", easing: Easing.bezier(...ease.snap) });
  const outP = interpolate(frame, [until, until + 14], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const tone = toast.tone === "critical" ? C.red : toast.tone === "warning" ? C.warning : C.queue;
  const s = width / 400;
  return (
    <div
      style={{
        position: "absolute",
        left: 12 * s,
        right: 12 * s,
        top: 58 * s,
        translate: `0 ${(1 - inP) * -120 * s}px`,
        opacity: outP * Math.min(1, inP * 1.6),
        background: "rgba(28,28,30,0.94)",
        border: `1px solid ${C.hairlineStrong}`,
        borderRadius: 22 * s,
        padding: `${11 * s}px ${14 * s}px`,
        boxShadow: "0 18px 40px rgba(0,0,0,0.6)",
        display: "flex",
        gap: 10 * s,
        alignItems: "flex-start",
      }}
    >
      <span style={{ flex: "none", width: 9 * s, height: 9 * s, borderRadius: 99, background: tone, marginTop: 6 * s }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 3 * s }}>
        <span style={{ fontFamily: FONT.sans, fontWeight: 700, fontSize: 14 * s, color: C.text }}>{toast.title}</span>
        <span style={{ fontFamily: FONT.sans, fontSize: 12.5 * s, lineHeight: 1.3, color: C.text2 }}>{toast.body}</span>
      </div>
    </div>
  );
};

export const PhoneScreen: React.FC<{
  slot: string;
  shots: Shot[];
  toasts?: HudToast[];
  width: number;
  startAt?: number;
}> = ({ slot, shots, toasts = [], width, startAt = 0 }) => {
  const footage = footageFor(slot);
  if (footage) {
    return <FootagePlayer footage={footage} startAt={startAt} />;
  }
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {shots.map((shot, i) => (
        <ShotLayer key={`${shot.still}-${shot.at}`} shot={shot} next={shots[i + 1]} />
      ))}
      {shots.flatMap((s) => s.taps ?? []).map((tap) => (
        <TapRipple key={`${tap.at}-${tap.x}-${tap.y}`} tap={tap} />
      ))}
      {toasts.map((toast) => (
        <Toast key={`${toast.at}-${toast.title}`} toast={toast} width={width} />
      ))}
    </AbsoluteFill>
  );
};

/** The frame: a thin dark bezel with soft highlights, sized by the screen height. */
export const Phone: React.FC<{
  screenHeight: number;
  slot: string;
  shots: Shot[];
  toasts?: HudToast[];
  glow?: string;
  glowStrength?: number;
  label?: React.ReactNode;
  /** Scene frame where the recording starts playing (it shows its first frame until then). */
  startAt?: number;
}> = ({ screenHeight, slot, shots, toasts, glow, glowStrength = 1, label, startAt }) => {
  const screenWidth = Math.round(screenHeight * SCREEN_ASPECT);
  const bezel = Math.round(screenWidth * 0.032);
  const radius = Math.round(screenWidth * 0.15);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
      {label ? <div>{label}</div> : null}
      <div
        style={{
          position: "relative",
          width: screenWidth + bezel * 2,
          height: screenHeight + bezel * 2,
          borderRadius: radius + bezel,
          padding: bezel,
          background: "linear-gradient(145deg, #3a3a3c 0%, #1c1c1e 22%, #0d0d0e 60%, #2c2c2e 100%)",
          boxShadow: [
            "0 0 0 1.5px rgba(255,255,255,0.10)",
            "inset 0 0 0 1.5px rgba(0,0,0,0.9)",
            "0 50px 120px rgba(0,0,0,0.75)",
            glow ? `0 0 ${140 * glowStrength}px ${30 * glowStrength}px ${glow}` : "0 0 0 0 transparent",
          ].join(", "),
        }}
      >
        <div
          style={{
            position: "relative",
            width: screenWidth,
            height: screenHeight,
            borderRadius: radius,
            overflow: "hidden",
            background: "#000",
          }}
        >
          <PhoneScreen slot={slot} shots={shots} toasts={toasts} width={screenWidth} startAt={startAt} />
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: radius,
              background: "linear-gradient(120deg, rgba(255,255,255,0.07) 0%, transparent 28%)",
              pointerEvents: "none",
            }}
          />
        </div>
      </div>
    </div>
  );
};

export const DeviceLabel: React.FC<{ letter: string; role: string; account: string; tone?: string }> = ({
  letter,
  role,
  account,
  tone = C.red,
}) => (
  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
    <span
      style={{
        width: 44,
        height: 44,
        borderRadius: 12,
        background: tone,
        color: "#fff",
        display: "grid",
        placeItems: "center",
        fontFamily: FONT.mono,
        fontWeight: 600,
        fontSize: 24,
      }}
    >
      {letter}
    </span>
    <span style={{ fontFamily: FONT.sans, fontWeight: 600, fontSize: 28, color: C.text }}>{role}</span>
    <span style={{ fontFamily: FONT.mono, fontSize: 24, color: C.text3 }}>{account}</span>
  </div>
);
