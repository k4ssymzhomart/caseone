// 0:08 The problem in three beats, in the case's own terms (docs/case, section 2), told like the landing's chapters.
import React from "react";
import { AbsoluteFill, interpolate, Sequence, useCurrentFrame } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Mascot, RotaMark, type MascotName } from "../components/brand";
import { Split } from "../components/layout";
import { Eyebrow, Headline, Lead, Mono, Reveal, useIn, useOut } from "../components/text";
import { C, FONT, T } from "../theme";

const CHAPTER = 140;

const Typewriter: React.FC<{ text: string; start: number; cps?: number }> = ({ text, start, cps = 16 }) => {
  const frame = useCurrentFrame();
  const n = Math.max(0, Math.floor(((frame - start) / 30) * cps));
  const caret = Math.floor(frame / 8) % 2 === 0;
  return (
    <span style={{ fontFamily: FONT.mono, fontWeight: 500, fontSize: 64, color: C.red300, letterSpacing: "-0.02em" }}>
      {text.slice(0, n)}
      <span style={{ opacity: caret ? 1 : 0 }}>_</span>
    </span>
  );
};

const Visual: React.FC<{ index: number }> = ({ index }) => {
  if (index === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <Typewriter text="Ахметов, приём!" start={14} />
        <Reveal delay={46}>
          <Mono size={T.small} color={C.text3}>
            Канал 3 · шум · ответа нет
          </Mono>
        </Reveal>
      </div>
    );
  }
  if (index === 1) {
    const rows: Array<[string, string]> = [
      ["Иванов", "занят?"],
      ["Петренко", "не отвечает"],
      ["Ким", "в другом цехе"],
      ["Сериков", "?"],
    ];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {rows.map(([name, state], i) => (
          <Reveal key={name} delay={12 + i * 9}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 16,
                padding: "14px 24px",
                borderRadius: 999,
                background: C.muted,
                border: `1px solid ${C.hairline}`,
                fontFamily: FONT.sans,
                fontSize: 30,
                color: C.text2,
                marginLeft: i * 34,
              }}
            >
              <span style={{ width: 12, height: 12, borderRadius: 99, background: C.off }} />
              <span style={{ color: C.text, fontWeight: 600 }}>{name}</span>
              <span>· {state}</span>
            </div>
          </Reveal>
        ))}
      </div>
    );
  }
  const rows = ["Фото после", "Перечень работ", "Списанные материалы"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {rows.map((r, i) => (
        <Reveal key={r} delay={12 + i * 10}>
          <div style={{ display: "flex", alignItems: "center", gap: 18, fontFamily: FONT.sans, fontSize: 34, color: C.text2 }}>
            <span
              style={{
                width: 44,
                height: 44,
                borderRadius: 99,
                display: "grid",
                placeItems: "center",
                background: "rgba(255,59,48,0.2)",
                color: C.red,
                fontWeight: 700,
                fontSize: 24,
              }}
            >
              ✕
            </span>
            <span style={{ textDecoration: "line-through", textDecorationColor: "rgba(255,255,255,0.35)" }}>{r}</span>
          </div>
        </Reveal>
      ))}
    </div>
  );
};

const Chapter: React.FC<{ index: number; title: string; lead: string; mascot: MascotName }> = ({
  index,
  title,
  lead,
  mascot,
}) => {
  const frame = useCurrentFrame();
  const out = useOut(CHAPTER - 16);
  const bigIn = useIn(0, 30);
  const bob = Math.sin(frame / 14) * 8;
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <AbsoluteFill style={{ alignItems: "flex-end", justifyContent: "center", paddingRight: 120 }}>
        <div
          style={{
            fontFamily: FONT.sans,
            fontWeight: 800,
            fontSize: 620,
            lineHeight: 1,
            letterSpacing: "-0.06em",
            color: "transparent",
            WebkitTextStroke: "2px rgba(255,255,255,0.09)",
            opacity: bigIn,
            translate: `${(1 - bigIn) * 60}px 0`,
          }}
        >
          0{index + 1}
        </div>
      </AbsoluteFill>
      <Split
        leftWidth={860}
        left={
          <>
            <Reveal delay={0}>
              <Eyebrow>Глава 0{index + 1} · из кейса</Eyebrow>
            </Reveal>
            <Reveal delay={6}>
              <Headline size={T.headline + 8}>{title}</Headline>
            </Reveal>
            <Reveal delay={14}>
              <Lead size={T.lead - 4}>{lead}</Lead>
            </Reveal>
          </>
        }
        right={
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 40 }}>
            <Visual index={index} />
            <Reveal delay={20}>
              <Mascot name={mascot} size={260} style={{ translate: `0 ${bob}px` }} />
            </Reveal>
          </div>
        }
      />
    </AbsoluteFill>
  );
};

const Bridge: React.FC = () => {
  const frame = useCurrentFrame();
  const p = useIn(0, 20);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 36, flexDirection: "column", opacity: p }}>
      <RotaMark size={120} rotate={interpolate(frame, [0, 60], [-120, 0], { extrapolateRight: "clamp" })} />
      <Headline size={T.title + 8} style={{ textAlign: "center" }}>
        Rota переводит наряд в телефон
        <br />и ставит ИИ на контроль
      </Headline>
    </AbsoluteFill>
  );
};

export const S02Problem: React.FC = () => (
  <AbsoluteFill>
    <Backdrop variant="glow" intensity={0.8} />
    <Sequence durationInFrames={CHAPTER}>
      <Chapter
        index={0}
        title="По рации и на бумаге."
        lead="Наряды выдают устно. Порядок работ в голове у мастера, срочные заявки ждут."
        mascot="tired"
      />
    </Sequence>
    <Sequence from={CHAPTER} durationInFrames={CHAPTER}>
      <Chapter
        index={1}
        title="Сроки никто не видит."
        lead="Мастер не знает, кто свободен, что выполняется и что уже просрочено."
        mascot="dizzy"
      />
    </Sequence>
    <Sequence from={CHAPTER * 2} durationInFrames={CHAPTER}>
      <Chapter
        index={2}
        title="Качество не проверить."
        lead="Нет фото, перечня работ и материалов. Повторные поломки замечают, когда уже авария."
        mascot="search"
      />
    </Sequence>
    <Sequence from={CHAPTER * 3}>
      <Bridge />
    </Sequence>
  </AbsoluteFill>
);
