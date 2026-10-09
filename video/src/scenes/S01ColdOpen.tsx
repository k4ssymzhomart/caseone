// 0:00 Cold open: the worker's red emergency screen with the siren, then the logo and the slogan.
import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { RotaLockup } from "../components/brand";
import { Phone } from "../components/Phone";
import { Eyebrow, Headline, Mono, Reveal } from "../components/text";
import { TAKE } from "../data/take";
import { C, T, ease } from "../theme";

const PHONE_OUT = 112;

const SirenRings: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      {[0, 1, 2, 3].map((i) => {
        const t = (frame + i * 18) % 72;
        const scale = interpolate(t, [0, 72], [0.55, 1.9]);
        const opacity = interpolate(t, [0, 10, 72], [0, 0.5, 0], { extrapolateRight: "clamp" });
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              width: 760,
              height: 760,
              borderRadius: 999,
              border: `3px solid ${C.red}`,
              scale: String(scale),
              opacity,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

export const S01ColdOpen: React.FC = () => {
  const frame = useCurrentFrame();
  const zoom = interpolate(frame, [0, 90], [1.22, 1], {
    extrapolateRight: "clamp",
    easing: Easing.bezier(...ease.out),
  });
  const phoneOut = interpolate(frame, [PHONE_OUT, PHONE_OUT + 22], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(...ease.inOut),
  });
  const alarm = interpolate(frame, [PHONE_OUT, PHONE_OUT + 30], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const brandIn = interpolate(frame, [PHONE_OUT + 10, PHONE_OUT + 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(...ease.out),
  });
  const markRotate = interpolate(frame, [PHONE_OUT + 10, PHONE_OUT + 56], [-180, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(...ease.out),
  });

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ opacity: 1 - brandIn * 0.999 }}>
        <Backdrop variant="alarm" intensity={alarm} />
      </AbsoluteFill>
      <AbsoluteFill style={{ opacity: brandIn }}>
        <Backdrop variant="wallpaper" intensity={0.9} />
      </AbsoluteFill>

      {frame < PHONE_OUT + 24 ? (
        <AbsoluteFill style={{ opacity: phoneOut }}>
          <SirenRings />
          <AbsoluteFill
            style={{
              alignItems: "center",
              justifyContent: "center",
              scale: String(zoom * interpolate(phoneOut, [0, 1], [0.86, 1])),
            }}
          >
            <Phone
              screenHeight={900}
              slot="s01-cold-open-B"
              glow="rgba(255,59,48,0.55)"
              glowStrength={0.8 + 0.4 * Math.abs(Math.sin(frame / 9))}
              shots={[{ still: "mobile/09-worker-emergency.png", at: 0, taps: [{ at: 92, x: 0.495, y: 0.82 }] }]}
            />
          </AbsoluteFill>
          <AbsoluteFill style={{ padding: "0 120px", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ width: 520, display: "flex", flexDirection: "column", gap: 22 }}>
              <Reveal delay={6}>
                <Eyebrow color={C.red300}>Аварийный наряд №{TAKE.emergencyNo}</Eyebrow>
              </Reveal>
              <Reveal delay={12}>
                <Headline size={T.title}>Насос НШ-32 маслостанции</Headline>
              </Reveal>
              <Reveal delay={20}>
                <Mono size={T.label} color={C.text2} weight={400}>
                  Течь масла · участок обогащения
                </Mono>
              </Reveal>
            </div>
            <div style={{ width: 460, display: "flex", flexDirection: "column", gap: 18, alignItems: "flex-end", textAlign: "right" }}>
              <Reveal delay={34}>
                <Mono size={T.label} color={C.text}>
                  Сирена звучит,
                  <br />
                  пока исполнитель
                  <br />
                  не ответит
                </Mono>
              </Reveal>
            </div>
          </AbsoluteFill>
        </AbsoluteFill>
      ) : null}

      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: brandIn }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 44 }}>
          <Reveal delay={PHONE_OUT + 8}>
            <Eyebrow color={C.red300}>Qostanai Industry Hackathon 2026 · Кейс 1 «НарядAI»</Eyebrow>
          </Reveal>
          <div style={{ scale: String(interpolate(brandIn, [0, 1], [0.92, 1])) }}>
            <RotaLockup height={150} markRotate={markRotate} wordOpacity={brandIn} />
          </div>
          <Reveal delay={PHONE_OUT + 34} distance={20}>
            <Headline size={T.headline} style={{ textAlign: "center" }}>
              Наряд выдан, ИИ на контроле
            </Headline>
          </Reveal>
          <Reveal delay={PHONE_OUT + 56} distance={12}>
            <Mono size={T.small + 2} color={C.text2} weight={400}>
              АО «Костанайские Минералы» · Demo Day 16.10.2026
            </Mono>
          </Reveal>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
