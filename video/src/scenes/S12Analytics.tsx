// 2:11 Web panel, AI analytics as руководитель 3001: the demo question typed, «Спросить», the К-3 card first, then its
// evidence. The recording (s12-analytics-web.mp4) is zoomed so the card reads at 1080p; the overlays below are drawn
// only over the stills, with the text of the recorded answer.
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Browser, WEB_H, WEB_W } from "../components/Browser";
import { LogoChip } from "../components/brand";
import { CountUp } from "../components/CountUp";
import { Split } from "../components/layout";
import { Eyebrow, Glass, Headline, Lead, Mono, Reveal, useIn } from "../components/text";
import { at } from "../data/footage";
import { NUMBERS } from "../data/numbers";
import { C, FONT } from "../theme";

const SLOT = "s12-analytics-web";
const QUESTION = "покажи проблемы участка дробления за месяц";
const TYPE_FROM = at(SLOT, 3.2);
const TYPE_TO = at(SLOT, 8.2);
const ASK = at(SLOT, 8.6);
const CARD = at(SLOT, 9.2);
const EVIDENCE = at(SLOT, 16.8);

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
          Спросить
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
          Конвейер К-3: повторяющийся отказ подшипника М-02
        </span>
        <span style={{ fontFamily: FONT.sans, fontSize: 26, color: C.text, lineHeight: 1.36 }}>
          За 30 дней на конвейере К-3 7 внеплановых остановок, это 2,3 раза больше медианы по парку, простой 32,3 ч. Шифр
          М-02 (подшипник) повторился 5 раз с медианой 6,3 дня между отказами, ремонты делали 4 разных исполнителя.
        </span>
        <div style={{ borderLeft: `3px solid ${C.red}`, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
          <Mono size={16} color={C.text3}>
            РЕКОМЕНДАЦИЯ
          </Mono>
          <span style={{ fontFamily: FONT.sans, fontSize: 25, color: C.text, lineHeight: 1.35 }}>
            Найти первопричину отказов подшипников (соосность, смазка, натяжение) и включить узел в план ППР.
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
      leftWidth={446}
      gap={50}
      left={
        <>
          <Reveal>
            <Eyebrow>Аналитика ИИ</Eyebrow>
          </Reveal>
          <Reveal delay={6}>
            <Headline size={68}>Спросите обычными словами</Headline>
          </Reveal>
          <Reveal delay={16}>
            <Lead size={27}>Haiku разбирает вопрос, детекторы считают в SQL, Sonnet пишет выводы только из этих цифр.</Lead>
          </Reveal>
          <Reveal delay={26}>
            <LogoChip name="claude" text="Claude Sonnet 5.5 · Haiku 5.5" size={24} />
          </Reveal>
          <Reveal delay={CARD + 20}>
            <Lead size={24} color={C.text}>
              У каждого вывода рекомендация и доказательства: наряды и график по неделям.
            </Lead>
          </Reveal>
          <Reveal delay={EVIDENCE}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <CountUp {...NUMBERS.patterns} delay={EVIDENCE} size={80} color={C.red} />
              <Lead size={23}>{NUMBERS.patterns.label}</Lead>
            </div>
          </Reveal>
        </>
      }
      right={
        <Browser
          slot={SLOT}
          url="rota-naryad.netlify.app/analytics"
          width={WEB_W}
          height={WEB_H}
          shots={[{ still: "web-live/w06-analytics.png", at: 0 }]}
          stillOverlay={
            <>
              <QuestionBar />
              <InsightCard />
            </>
          }
        />
      }
    />
  </AbsoluteFill>
);
