// 2:32 The privacy gateway on the real log: admin 9001 opens «Что видит ИИ» (/admin/ai), filters «Проверка наряда» and
// opens request №47, the check of №660 from the film's take, where the worker is only «E01». The request line quotes
// the header s13-privacy-web.mp4 shows.
import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Mascot } from "../components/brand";
import { Browser, WEB_H, WEB_W } from "../components/Browser";
import { Split } from "../components/layout";
import { Eyebrow, Headline, Lead, Mono, Reveal } from "../components/text";
import { at } from "../data/footage";
import { TAKE } from "../data/take";
import { C, FONT, ease } from "../theme";

const SLOT = "s13-privacy-web";
const REQUEST = at(SLOT, 9.6);

const Redact: React.FC<{ name: string; code: string; role: string; at: number }> = ({ name, code, role, at: shownAt }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [shownAt, shownAt + 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(...ease.out),
  });
  const strike = interpolate(frame, [shownAt - 10, shownAt], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <span style={{ position: "relative", fontFamily: FONT.sans, fontWeight: 600, fontSize: 34, color: C.text, minWidth: 210 }}>
          {name}
          <span style={{ position: "absolute", left: 0, top: "52%", height: 3, width: `${strike * 100}%`, background: C.red }} />
        </span>
        <Mono size={32} color={C.text3}>
          →
        </Mono>
        <span
          style={{
            fontFamily: FONT.mono,
            fontWeight: 600,
            fontSize: 34,
            color: "#fff",
            background: C.red,
            padding: "2px 16px",
            borderRadius: 10,
            opacity: p,
            scale: String(interpolate(p, [0, 1], [0.7, 1])),
          }}
        >
          {code}
        </span>
      </div>
      <Mono size={19} color={C.text3} weight={400}>
        {role}
      </Mono>
    </div>
  );
};

export const S13Privacy: React.FC = () => (
  <AbsoluteFill>
    <Backdrop variant="glow" intensity={0.8} />
    <Split
      leftWidth={446}
      gap={50}
      left={
        <>
          <Reveal>
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <Mascot name="shield" size={84} />
              <Eyebrow>Шлюз приватности</Eyebrow>
            </div>
          </Reveal>
          <Reveal delay={6}>
            <Headline size={68}>Модель не видит людей</Headline>
          </Reveal>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Redact name="Ахметов Е." code="E01" role="исполнитель, таб. 2001" at={30} />
            <Redact name="Жумабаев Н." code="M01" role="мастер, таб. 1001" at={52} />
          </div>
          <Reveal delay={70}>
            <Lead size={24}>
              Фамилии, табельные номера и телефоны заменяются до отправки. Журнал «Что видит ИИ» хранит каждый запрос
              ровно в том виде, в каком его получила модель.
            </Lead>
          </Reveal>
          <Reveal delay={REQUEST}>
            <Mono size={19} color={C.text} weight={400} style={{ lineHeight: 1.45 }}>
              Запрос №47 · наряд №{TAKE.emergencyNo}
              <br />
              claude-sonnet-5-5 · 6,2 с · 0,0162 USD
            </Mono>
          </Reveal>
        </>
      }
      right={
        <Browser
          slot={SLOT}
          url="rota-naryad.netlify.app/admin/ai"
          width={WEB_W}
          height={WEB_H}
          shots={[]}
        />
      }
    />
  </AbsoluteFill>
);
