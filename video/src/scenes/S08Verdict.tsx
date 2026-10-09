// 1:22 The verdict of №660 on both phones, then the master's final word. From 0,9 s of s08-verdict-A/B.mp4: A opens
// the AI report, scrolls to the photos and materials and taps «Согласен, закрыть» at 8,29 s; B gets «Закрыт №660»
// 0,71 s later (docs/live-loop-timings.md, interval 8). Texts are the review of the take (src/data/take.ts).
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Split } from "../components/layout";
import { DeviceLabel, Phone, type Shot } from "../components/Phone";
import { CheckRow, Eyebrow, Headline, Lead, Mono, Reveal, StatusPill } from "../components/text";
import { at } from "../data/footage";
import { TAKE } from "../data/take";
import { C, FONT } from "../theme";

const CLOSE = at("s08-verdict-A", 8.29);
const CLOSED_ON_B = at("s08-verdict-B", 9.0);

const A_SHOTS: Shot[] = [
  { still: "pwa/19-A-ai-report.png", at: 0 },
  { still: "pwa/20-A-ai-report-photos.png", at: 120, taps: [{ at: CLOSE, x: 0.5, y: 0.798 }] },
  { still: "pwa/21-A-closed.png", at: CLOSE + 12 },
];
const B_SHOTS: Shot[] = [
  { still: "pwa/17-B-ai-verdict.png", at: 0 },
  { still: "pwa/22-B-closed-notice.png", at: CLOSED_ON_B },
];

const Closed: React.FC = () => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [CLOSED_ON_B, CLOSED_ON_B + 8], [0.3, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <span style={{ opacity: p }}>
      <StatusPill color={C.off}>Закрыт</StatusPill>
    </span>
  );
};

export const S08Verdict: React.FC = () => (
  <AbsoluteFill>
    <Backdrop variant="glow" />
    <Split
      leftWidth={660}
      gap={40}
      left={
        <>
          <Reveal>
            <Eyebrow>Шаг 5 · вердикт и решение мастера</Eyebrow>
          </Reveal>
          <Reveal delay={6}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 20 }}>
              <span style={{ fontFamily: FONT.mono, fontWeight: 500, fontSize: 132, lineHeight: 1, color: C.text, letterSpacing: "-0.05em" }}>
                {TAKE.verdict.score}
              </span>
              <span style={{ fontFamily: FONT.sans, fontSize: 38, color: C.text2 }}>из 100</span>
              <StatusPill color={C.free} size={30}>
                {TAKE.verdict.label}
              </StatusPill>
            </div>
          </Reveal>
          <Reveal delay={12}>
            <Mono size={23} color={C.text2} weight={400}>
              уверенность {TAKE.verdict.confidencePct}% · ниже 60% решает мастер
            </Mono>
          </Reveal>
          <Reveal delay={22}>
            <Lead size={28} color={C.text}>
              «{TAKE.verdictDetails.summaryMaster}»
            </Lead>
          </Reveal>
          <Reveal delay={60}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <CheckRow kind="pass" size={26} title="Что хорошо" detail={TAKE.verdictDetails.good[0]} />
              <CheckRow kind="warn" size={26} title="Что улучшить" detail={TAKE.verdictDetails.improve[1]} />
            </div>
          </Reveal>
          <Reveal delay={CLOSE - 14}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 4 }}>
              <Headline size={54}>Последнее слово за мастером</Headline>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <span
                  style={{
                    fontFamily: FONT.sans,
                    fontWeight: 600,
                    fontSize: 26,
                    color: "#000",
                    background: "#fff",
                    padding: "11px 24px",
                    borderRadius: 999,
                  }}
                >
                  Согласен, закрыть
                </span>
                <Mono size={26} color={C.text3}>
                  →
                </Mono>
                <Closed />
              </div>
            </div>
          </Reveal>
        </>
      }
      right={
        <>
          <Phone screenHeight={800} slot="s08-verdict-A" shots={A_SHOTS} label={<DeviceLabel letter="A" role="Мастер" account="1001" />} />
          <Phone screenHeight={800} slot="s08-verdict-B" shots={B_SHOTS} label={<DeviceLabel letter="B" role="Исполнитель" account="2001" />} />
        </>
      }
    />
  </AbsoluteFill>
);
