// 2:11 Web panel, AI analytics: the demo question in plain Russian, and the К-3 card in the case's own tone.
// The card text is the live answer to this question (docs/phase6-acceptance.md, run 2, and the rules card there).
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Browser } from "../components/Browser";
import { LogoChip } from "../components/brand";
import { CountUp } from "../components/CountUp";
import { Split } from "../components/layout";
import { Eyebrow, Glass, Headline, Lead, Mono, Reveal, useIn } from "../components/text";
import { NUMBERS } from "../data/numbers";
import { C, FONT } from "../theme";
import { BROWSER_H, BROWSER_W } from "./S10ShiftReport";

const QUESTION = "покажи проблемы участка дробления за месяц";
const TYPE_FROM = 30;
const TYPE_TO = 104;
const ASK = 116;
const CARD = 150;

/** The question as typed into the ask box, large enough to read, floating over the top of the page. */
const QuestionBar: React.FC = () => {
  const frame = useCurrentFrame();
  const p = useIn(TYPE_FROM - 14, 16);
  const n = Math.round(interpolate(frame, [TYPE_FROM, TYPE_TO], [0, QUESTION.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const caret = frame < ASK && Math.floor(frame / 8) % 2 === 0;
  const pressed = Math.max(0, 1 - Math.abs(frame - ASK) / 6);
  const sent = frame >= ASK;
  return (
    <div style={{ position: "absolute", left: 70, right: 70, top: 150, opacity: p, translate: `0 ${(1 - p) * -20}px` }}>
      <Glass strong style={{ padding: "16px 16px 16px 30px", display: "flex", alignItems: "center", gap: 20, borderRadius: 999 }}>
        <span style={{ flex: 1, minWidth: 0, fontFamily: FONT.sans, fontSize: 30, color: n > 0 ? C.text : C.text3, whiteSpace: "nowrap" }}>
          {n > 0 ? QUESTION.slice(0, n) : "Спросите, например…"}
          <span style={{ opacity: caret ? 1 : 0, color: C.red }}>|</span>
        </span>
        <span
          style={{
            fontFamily: FONT.sans,
            fontWeight: 600,
            fontSize: 24,
            padding: "12px 26px",
            borderRadius: 999,
            background: sent ? C.red : "#fff",
            color: sent ? "#fff" : "#000",
            scale: String(1 - 0.08 * pressed),
            whiteSpace: "nowrap",
          }}
        >
          {sent ? "ИИ думает…" : "Спросить"}
        </span>
      </Glass>
    </div>
  );
};

const InsightCard: React.FC = () => {
  const p = useIn(CARD, 22);
  return (
    <div
      style={{
        position: "absolute",
        left: 40,
        right: 40,
        bottom: 34,
        opacity: p,
        translate: `0 ${(1 - p) * 60}px`,
      }}
    >
      <Glass strong style={{ padding: "30px 34px", display: "flex", flexDirection: "column", gap: 16, borderColor: "rgba(255,59,48,0.45)" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Mono size={18} color={C.text2}>
            ЗА 30 ДНЕЙ · УЧАСТОК ДРОБЛЕНИЯ · ПОВТОРНЫЕ ОТКАЗЫ
          </Mono>
          <span
            style={{
              fontFamily: FONT.mono,
              fontWeight: 600,
              fontSize: 16,
              color: "#fff",
              background: C.red,
              padding: "3px 10px",
              borderRadius: 6,
            }}
          >
            ИИ
          </span>
        </div>
        <span style={{ fontFamily: FONT.sans, fontWeight: 700, fontSize: 38, color: C.text, letterSpacing: "-0.02em", lineHeight: 1.12 }}>
          Конвейер К-3: повторяющиеся отказы подшипника М-02
        </span>
        <span style={{ fontFamily: FONT.sans, fontSize: 26, color: C.text, lineHeight: 1.36 }}>
          7 внеплановых остановок за 30 дней, 5 из них шифр М-02, в среднем через 6,3 дня. В 2,3 раза больше медианы по
          парку, простой 32,3 ч.
        </span>
        <div style={{ borderLeft: `3px solid ${C.red}`, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
          <Mono size={16} color={C.text3}>
            РЕКОМЕНДАЦИЯ
          </Mono>
          <span style={{ fontFamily: FONT.sans, fontSize: 25, color: C.text, lineHeight: 1.35 }}>
            Проверить соосность привода и смазку, включить замену узла в план ППР.
          </span>
        </div>
        <Mono size={18} color={C.text2}>
          Доказательства · 7 нарядов
        </Mono>
      </Glass>
    </div>
  );
};

export const S12Analytics: React.FC = () => (
  <AbsoluteFill>
    <Backdrop variant="glow" />
    <Split
      leftWidth={500}
      gap={60}
      left={
        <>
          <Reveal>
            <Eyebrow>Аналитика ИИ</Eyebrow>
          </Reveal>
          <Reveal delay={6}>
            <Headline size={72}>Спросите обычными словами</Headline>
          </Reveal>
          <Reveal delay={20}>
            <Lead size={28}>Haiku разбирает вопрос, детекторы считают в SQL, Sonnet пишет выводы только из этих цифр.</Lead>
          </Reveal>
          <Reveal delay={30}>
            <LogoChip name="claude" text="Claude Sonnet 5.5 · Haiku 5.5" size={26} />
          </Reveal>
          <Reveal delay={CARD + 30}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <CountUp {...NUMBERS.patterns} delay={CARD + 30} size={96} color={C.red} />
              <Lead size={24}>{NUMBERS.patterns.label}</Lead>
            </div>
          </Reveal>
        </>
      }
      right={
        <div style={{ position: "relative" }}>
          <Browser
            slot="s12-analytics-web"
            url="rota-naryad.netlify.app/analytics"
            width={BROWSER_W}
            height={BROWSER_H}
            shots={[{ still: "web-live/w06-analytics.png", at: 0 }]}
          />
          <QuestionBar />
          <InsightCard />
        </div>
      }
    />
  </AbsoluteFill>
);
