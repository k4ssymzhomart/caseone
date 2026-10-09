// 2:46 Outro: the logo, the slogan, the links and the test accounts.
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Logo, Mascot, RotaLockup } from "../components/brand";
import { Headline, Mono, Reveal, useIn } from "../components/text";
import type { PlatformLogoName } from "../../../packages/design/src/brand/platforms";
import { C, FONT } from "../theme";

const LINKS: Array<{ logo: PlatformLogoName; label: string; value: string }> = [
  { logo: "chrome", label: "Сайт и веб панель", value: "rota-naryad.netlify.app" },
  { logo: "safari", label: "Телефон в браузере", value: "rota-naryad.netlify.app/app" },
  { logo: "android", label: "APK для Android", value: "expo.dev · сборка EAS" },
  { logo: "github", label: "Код и инструкции", value: "github.com/k4ssymzhomart/caseone" },
];

export const S15Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const p = useIn(0, 30);
  const bob = Math.sin(frame / 12) * 10;
  return (
    <AbsoluteFill>
      <Backdrop variant="wallpaper" intensity={0.85} />
      <AbsoluteFill style={{ padding: "96px 120px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 46 }}>
        <div style={{ opacity: p, scale: String(interpolate(p, [0, 1], [0.94, 1])), transformOrigin: "left center" }}>
          <RotaLockup height={110} markRotate={interpolate(frame, [0, 40], [-90, 0], { extrapolateRight: "clamp" })} />
        </div>
        <Reveal delay={10}>
          <Headline size={104}>Наряд выдан, ИИ на контроле</Headline>
        </Reveal>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "22px 60px", maxWidth: 1260 }}>
          {LINKS.map((l, i) => (
            <Reveal key={l.value} delay={30 + i * 8}>
              <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                <span
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 18,
                    display: "grid",
                    placeItems: "center",
                    background: "rgba(255,255,255,0.08)",
                    border: `1px solid ${C.hairline}`,
                  }}
                >
                  <Logo name={l.logo} size={34} />
                </span>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontFamily: FONT.sans, fontSize: 24, color: C.text2 }}>{l.label}</span>
                  <Mono size={30}>{l.value}</Mono>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={70}>
          <Mono size={26} color={C.text2} weight={400}>
            Мастер 1001 / 1111 · Исполнитель 2001 / 1234 · Руководитель 3001 / 3333
          </Mono>
        </Reveal>
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "flex-end", justifyContent: "flex-end", padding: "0 150px 120px 0" }}>
        <Reveal delay={40}>
          <Mascot name="wave" size={300} style={{ translate: `0 ${bob}px` }} />
        </Reveal>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
