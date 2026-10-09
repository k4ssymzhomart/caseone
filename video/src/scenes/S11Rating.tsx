// 1:59 Web panel, rating for the month: five components with fixed weights; Сериков at the bottom (PATTERNS P2).
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Browser } from "../components/Browser";
import { Split } from "../components/layout";
import { Eyebrow, Glass, Headline, Lead, Mono, Reveal } from "../components/text";
import { formatRu, NUMBERS } from "../data/numbers";
import { C, FONT } from "../theme";
import { BROWSER_H, BROWSER_W } from "./S10ShiftReport";

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
      <div style={{ display: "flex", height: 26, borderRadius: 8, overflow: "hidden", width: 500, background: C.muted }}>
        {WEIGHTS.map(([name, w, color], i) => {
          const p = interpolate(frame, [20 + i * 8, 40 + i * 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return <div key={name} style={{ width: `${w * p}%`, background: color, borderRight: "2px solid #000" }} />;
        })}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", columnGap: 22, rowGap: 8, width: 500 }}>
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
      leftWidth={500}
      gap={60}
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
          <Reveal delay={150}>
            <Glass style={{ padding: "22px 26px", display: "flex", flexDirection: "column", gap: 10 }}>
              <Mono size={20} color={C.red300}>
                Сериков Д. · последнее место
              </Mono>
              <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
                <span style={{ fontFamily: FONT.mono, fontWeight: 500, fontSize: 64, color: C.red, letterSpacing: "-0.04em" }}>
                  {formatRu(NUMBERS.serikovF.value, 1)}%
                </span>
                <span style={{ fontFamily: FONT.sans, fontSize: 24, color: C.text2 }}>
                  с первого раза при {formatRu(NUMBERS.teamF.value, 1)}% у команды, 92 дня
                </span>
              </div>
            </Glass>
          </Reveal>
          <Reveal delay={60}>
            <Lead size={24}>Оценки сглажены по команде: исполнитель с двумя нарядами не выйдет в лидеры.</Lead>
          </Reveal>
        </>
      }
      right={
        <Browser
          slot="s11-rating-web"
          url="rota-naryad.netlify.app/reports/rating"
          width={BROWSER_W}
          height={BROWSER_H}
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
