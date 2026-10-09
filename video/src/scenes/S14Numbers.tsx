// 2:35 Measured numbers in two pages, each with the file that holds the measurement (src/data/numbers.ts).
import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { CountUp } from "../components/CountUp";
import { Eyebrow, Headline, Mono, Reveal, useOut } from "../components/text";
import { NUMBERS, type FilmNumber } from "../data/numbers";
import { C, FONT, SAFE } from "../theme";

const PAGE = 180;

const Tile: React.FC<{ n: FilmNumber; delay: number }> = ({ n, delay }) => (
  <Reveal delay={delay} style={{ flex: 1, minWidth: 0 }}>
    <div
      style={{
        height: 470,
        borderRadius: 28,
        background: "linear-gradient(180deg, rgba(28,28,30,0.95), rgba(22,22,23,0.85))",
        border: `1px solid ${C.hairlineStrong}`,
        padding: "40px 34px",
        display: "flex",
        flexDirection: "column",
        gap: 22,
      }}
    >
      <CountUp value={n.value} decimals={n.decimals} suffix={n.suffix} delay={delay + 4} duration={40} size={86} suffixColor={C.text2} />
      <span style={{ fontFamily: FONT.sans, fontSize: 30, lineHeight: 1.3, color: C.text, flex: 1 }}>{n.label}</span>
      <Mono size={19} color={C.text3} weight={400}>
        {n.source}
      </Mono>
    </div>
  </Reveal>
);

const Page: React.FC<{ title: string; items: FilmNumber[] }> = ({ title, items }) => {
  const out = useOut(PAGE - 14);
  return (
    <AbsoluteFill style={{ padding: `${SAFE.y}px ${SAFE.x}px`, display: "flex", flexDirection: "column", gap: 48, opacity: out }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Reveal>
          <Eyebrow>Цифры · измерено, со ссылкой на файл</Eyebrow>
        </Reveal>
        <Reveal delay={4}>
          <Headline size={84}>{title}</Headline>
        </Reveal>
      </div>
      <div style={{ display: "flex", gap: 28 }}>
        {items.map((n, i) => (
          <Tile key={n.label} n={n} delay={12 + i * 8} />
        ))}
      </div>
    </AbsoluteFill>
  );
};

export const S14Numbers: React.FC = () => (
  <AbsoluteFill>
    <Backdrop variant="glow" />
    <Sequence durationInFrames={PAGE}>
      <Page title="ИИ точный, быстрый и дешёвый" items={[NUMBERS.golden, NUMBERS.redScreen, NUMBERS.verdict, NUMBERS.checkCost]} />
    </Sequence>
    <Sequence from={PAGE} durationInFrames={PAGE}>
      <Page title="Данные и надёжность" items={[NUMBERS.history, NUMBERS.patterns, NUMBERS.shiftReport, NUMBERS.tests]} />
    </Sequence>
  </AbsoluteFill>
);
