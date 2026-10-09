// 1:56 Web panel, rating for the month: five components with fixed weights; Сериков at the bottom (PATTERNS P2).
// The month figures are the ones s11-rating-web.mp4 shows (73% first time fix, last of 15); the 92 day figures are
// docs/phase5-acceptance.md.
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Browser, WEB_H, WEB_W } from "../components/Browser";
import { Split } from "../components/layout";
import { Eyebrow, Glass, Headline, Lead, Mono, Reveal } from "../components/text";
import { formatRu, NUMBERS } from "../data/numbers";
import { at } from "../data/footage";
import { C, FONT } from "../theme";

const SLOT = "s11-rating-web";

// Colors of the panel's own chart (apps/web rating page).
const WEIGHTS: Array<[string, number, string]> = [
  ["Качество", 35, "#3B82F6"],
  ["В срок", 25, "#E2562B"],
  ["С первого раза", 20, "#159A6E"],
  ["Объём", 10, "#D4930D"],
  ["Дисциплина", 10, "#E0457B"],
];

const WeightBar: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", height: 26, borderRadius: 8, overflow: "hidden", width: 446, background: C.muted }}>
        {WEIGHTS.map(([name, w, color], i) => {
          const p = interpolate(frame, [20 + i * 8, 40 + i * 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return <div key={name} style={{ width: `${w * p}%`, background: color, borderRight: "2px solid #000" }} />;
        })}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", columnGap: 22, rowGap: 8, width: 446 }}>
        {WEIGHTS.map(([name, w, color]) => (
          <span key={name} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: FONT.sans, fontSize: 22, color: C.text2 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: color }} />
            {name}
            <span style={{ fontFamily: FONT.mono, color: C.text }}>{w}%</span>
          </span>
        ))}
      </div>
    </div>
  );
};

export const S11Rating: React.FC = () => (
  <AbsoluteFill>
    <Backdrop variant="glow" />
    <Split
      leftWidth={446}
      gap={50}
      left={
        <>
          <Reveal>
            <Eyebrow>Рейтинг · месяц</Eyebrow>
          </Reveal>
          <Reveal delay={6}>
            <Headline size={72}>Рейтинг из пяти частей</Headline>
          </Reveal>
          <Reveal delay={14}>
            <WeightBar />
          </Reveal>
          <Reveal delay={at(SLOT, 10.6)}>
            <Glass style={{ padding: "22px 26px", display: "flex", flexDirection: "column", gap: 10 }}>
              <Mono size={20} color={C.red300}>
                Сериков Д. · 15 из 15 за месяц
              </Mono>
              <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
                <span style={{ fontFamily: FONT.mono, fontWeight: 500, fontSize: 64, color: C.red, letterSpacing: "-0.04em" }}>
                  73%
                </span>
                <span style={{ fontFamily: FONT.sans, fontSize: 24, color: C.text2 }}>с первого раза</span>
              </div>
              <span style={{ fontFamily: FONT.sans, fontSize: 22, color: C.text2, lineHeight: 1.35 }}>
                За 92 дня {formatRu(NUMBERS.serikovF.value, 1)}% при {formatRu(NUMBERS.teamF.value, 1)}% у команды: больше трети
                его ремонтов не с первого раза.
              </span>
            </Glass>
          </Reveal>
          <Reveal delay={60}>
            <Lead size={24}>Оценки сглажены по команде: исполнитель с двумя нарядами не выйдет в лидеры.</Lead>
          </Reveal>
        </>
      }
      right={
        <Browser
          slot={SLOT}
          url="rota-naryad.netlify.app/reports/rating"
          width={WEB_W}
          height={WEB_H}
          shots={[
            {
              still: "web-live/w05-rating.png",
              at: 0,
              scroll: [
                [0, 0],
                [70, 0],
                [170, 0.6],
              ],
            },
          ]}
          marks={[{ still: "web-live/w05-rating.png", at: 176, x: 0.182, y: 0.908, w: 0.797, h: 0.032 }]}
        />
      }
    />
  </AbsoluteFill>
);
