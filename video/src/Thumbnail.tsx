// The YouTube thumbnail: the cold open's red emergency screen (first frame of its recording) beside the lockup and the
// slogan, laid out at 1920 × 1080 and scaled to 1280 × 720. Type is oversized so it still reads at 168 px wide.
import React from "react";
import { AbsoluteFill } from "remotion";
import { RotaLockup } from "./components/brand";
import { Phone } from "./components/Phone";
import { Eyebrow, Headline } from "./components/text";
import { HEIGHT, WIDTH } from "./data/scenes";
import { C } from "./theme";

const PHONE_X = 1530;

const Rings: React.FC = () => (
  <>
    {[560, 820, 1080, 1340].map((d, i) => (
      <div
        key={d}
        style={{
          position: "absolute",
          left: PHONE_X - d / 2,
          top: HEIGHT / 2 - d / 2,
          width: d,
          height: d,
          borderRadius: 9999,
          border: `3px solid ${C.red}`,
          opacity: 0.5 - i * 0.11,
        }}
      />
    ))}
  </>
);

const Layout: React.FC = () => (
  <AbsoluteFill style={{ background: C.canvas }}>
    <AbsoluteFill
      style={{
        background: `radial-gradient(48% 78% at ${(PHONE_X / WIDTH) * 100}% 50%, rgba(255,59,48,0.62), rgba(143,10,5,0.32) 55%, transparent 82%)`,
      }}
    />
    <AbsoluteFill style={{ background: "linear-gradient(90deg, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.35) 46%, transparent 62%)" }} />
    <Rings />
    <div style={{ position: "absolute", left: PHONE_X, top: HEIGHT / 2, translate: "-50% -50%" }}>
      <Phone
        screenHeight={1000}
        slot="s01-cold-open-B"
        glow="rgba(255,59,48,0.6)"
        glowStrength={1.1}
        shots={[{ still: "pwa/06-B-emergency-red-screen.png", at: 0 }]}
      />
    </div>
    <div
      style={{
        position: "absolute",
        left: 110,
        top: 0,
        bottom: 0,
        width: 1130,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 56,
      }}
    >
      <Eyebrow color={C.red300} size={34}>
        Qostanai Industry Hackathon 2026
      </Eyebrow>
      <RotaLockup height={168} />
      <Headline size={142} style={{ lineHeight: 0.98, textWrap: "wrap" }}>
        Наряд выдан,
        <br />
        <span style={{ color: C.red }}>ИИ</span> на контроле
      </Headline>
    </div>
  </AbsoluteFill>
);

export const Thumbnail: React.FC = () => (
  <AbsoluteFill style={{ background: "#000" }}>
    <div style={{ position: "absolute", left: 0, top: 0, width: WIDTH, height: HEIGHT, scale: String(1280 / WIDTH), transformOrigin: "0 0" }}>
      <Layout />
    </div>
  </AbsoluteFill>
);
