// 1:21 The AI check: rules R1 to R4 in SQL decide hard failures, Claude Sonnet 5.5 judges the photos and the text.
// Rule results and the quote are from the live Sonnet review in docs/screenshots/presentation (mobile/29, pwa/19).
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Logo } from "../components/brand";
import { CountUp } from "../components/CountUp";
import { Split } from "../components/layout";
import { DeviceLabel, Phone } from "../components/Phone";
import { Eyebrow, Glass, Headline, Lead, Mono, Reveal } from "../components/text";
import { NUMBERS } from "../data/numbers";
import { C, FONT } from "../theme";

const RULES: Array<{ at: number; kind: "pass" | "warn"; title: string; pts: string; note?: string }> = [
  { at: 22, kind: "pass", title: "Полнота отчёта", pts: "20 из 20" },
  { at: 34, kind: "pass", title: "Подлинность фото", pts: "10 из 10" },
  { at: 46, kind: "pass", title: "Материалы в норме", pts: "15 из 15" },
  { at: 58, kind: "warn", title: "Время и срок", pts: "10 из 20", note: "подозрительно быстро" },
];

const RuleRow: React.FC<(typeof RULES)[number]> = ({ at, kind, title, pts, note }) => {
  const frame = useCurrentFrame();
  const on = interpolate(frame, [at, at + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const tone = kind === "pass" ? C.free : C.warning;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, opacity: 0.25 + 0.75 * on }}>
      <span
        style={{
          width: 38,
          height: 38,
          borderRadius: 99,
          display: "grid",
          placeItems: "center",
          background: on > 0.5 ? `${tone}30` : C.muted,
          color: tone,
          fontFamily: FONT.sans,
          fontWeight: 700,
          fontSize: 22,
        }}
      >
        {on > 0.5 ? (kind === "pass" ? "✓" : "!") : "…"}
      </span>
      <span style={{ fontFamily: FONT.sans, fontWeight: 600, fontSize: 30, color: C.text, flex: 1 }}>
        {title}
        {note && on > 0.5 ? <span style={{ fontWeight: 400, color: C.text2 }}> · {note}</span> : null}
      </span>
      <Mono size={24} color={C.text2}>
        {pts}
      </Mono>
    </div>
  );
};

export const S07Check: React.FC = () => (
  <AbsoluteFill>
    <Backdrop variant="glow" />
    <Split
      leftWidth={860}
      left={
        <>
          <Reveal>
            <Eyebrow>Проверка ИИ · около 10 секунд</Eyebrow>
          </Reveal>
          <Reveal delay={6}>
            <Headline size={80}>Правила решают, модель оценивает</Headline>
          </Reveal>
          <Reveal delay={14}>
            <Glass style={{ padding: "24px 30px", display: "flex", flexDirection: "column", gap: 16 }}>
              <Eyebrow size={20} color={C.text2} dot={false}>
                Правила R1…R4 в SQL
              </Eyebrow>
              {RULES.map((r) => (
                <RuleRow key={r.title} {...r} />
              ))}
            </Glass>
          </Reveal>
          <Reveal delay={74}>
            <Glass style={{ padding: "24px 30px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <Logo name="claude" size={34} />
                <span style={{ fontFamily: FONT.sans, fontWeight: 700, fontSize: 32, color: C.text }}>Claude Sonnet 5.5</span>
                <Mono size={22} color={C.text3} weight={400}>
                  фото до и после, текст, материалы
                </Mono>
              </div>
              <Lead size={30} color={C.text}>
                «По тексту и фото работы соответствуют проблеме: течь устранена, шифр и материалы в норме.»
              </Lead>
            </Glass>
          </Reveal>
          <Reveal delay={120}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 22 }}>
              <CountUp {...NUMBERS.verdict} delay={120} size={96} color={C.red} />
              <Lead size={26}>{NUMBERS.verdict.label}</Lead>
            </div>
          </Reveal>
        </>
      }
      right={
        <Phone
          screenHeight={840}
          slot="s07-check-B"
          shots={[{ still: "pwa/16-B-sent-for-review.png", at: 0 }]}
          label={<DeviceLabel letter="B" role="Исполнитель" account="2001" />}
        />
      }
    />
  </AbsoluteFill>
);
