// The dark canvas with slow red glows, as on the landing page.
import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { C } from "../theme";

export const Backdrop: React.FC<{
  variant?: "plain" | "glow" | "wallpaper" | "alarm";
  /** 0..1 strength of the glows. */
  intensity?: number;
}> = ({ variant = "glow", intensity = 1 }) => {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 90) * 40;
  const drift2 = Math.cos(frame / 110) * 50;

  if (variant === "wallpaper") {
    return (
      <AbsoluteFill style={{ background: C.canvas }}>
        <Img
          src={staticFile("brand/wallpaper.jpg")}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: 0.85 * intensity,
            scale: String(interpolate(frame, [0, 600], [1.08, 1.0], { extrapolateRight: "clamp" })),
          }}
        />
        <AbsoluteFill
          style={{ background: "radial-gradient(70% 80% at 30% 50%, rgba(0,0,0,0.75), rgba(0,0,0,0.25) 70%, rgba(0,0,0,0.6))" }}
        />
      </AbsoluteFill>
    );
  }

  if (variant === "alarm") {
    const pulse = 0.55 + 0.45 * Math.abs(Math.sin(frame / 9));
    return (
      <AbsoluteFill style={{ background: C.canvas }}>
        <AbsoluteFill
          style={{
            background: `radial-gradient(55% 70% at 50% 50%, rgba(255,59,48,${0.5 * pulse * intensity}), rgba(143,10,5,${0.25 * intensity}) 55%, transparent 80%)`,
          }}
        />
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ background: C.canvas }}>
      {variant === "glow" ? (
        <>
          <AbsoluteFill
            style={{
              background: `radial-gradient(42% 55% at ${86 + drift / 40}% ${18 + drift2 / 60}%, rgba(195,16,8,${0.32 * intensity}), transparent 70%)`,
            }}
          />
          <AbsoluteFill
            style={{
              background: `radial-gradient(38% 48% at ${8 + drift2 / 50}% ${96 + drift / 50}%, rgba(143,10,5,${0.28 * intensity}), transparent 72%)`,
            }}
          />
        </>
      ) : null}
      <AbsoluteFill
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
          backgroundSize: "96px 96px",
          maskImage: "radial-gradient(80% 80% at 50% 50%, black, transparent)",
          opacity: 0.6,
        }}
      />
    </AbsoluteFill>
  );
};
