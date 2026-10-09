// 1:28 The verdict on both phones, then the master's final word: «Согласен, закрыть».
import React from "react";
import { AbsoluteFill } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Split } from "../components/layout";
import { DeviceLabel, Phone, type Shot } from "../components/Phone";
import { CheckRow, Eyebrow, Headline, Lead, Reveal, StatusPill } from "../components/text";
import { TAKE } from "../data/take";
import { C, FONT } from "../theme";

const CLOSE = 228;

const A_SHOTS: Shot[] = [
  { still: "pwa/19-A-ai-report.png", at: 0 },
  { still: "pwa/20-A-ai-report-photos.png", at: 120, taps: [{ at: CLOSE, x: 0.5, y: 0.798 }] },
  { still: "pwa/21-A-closed.png", at: CLOSE + 12 },
];
const B_SHOTS: Shot[] = [
  { still: "pwa/17-B-ai-verdict.png", at: 0 },
  { still: "pwa/22-B-closed-notice.png", at: CLOSE + 24 },
];

export const S08Verdict: React.FC = () => (
  <AbsoluteFill>
    <Backdrop variant="glow" />
    <Split
      leftWidth={640}
      gap={40}
      left={
        <>
          <Reveal>
            <Eyebrow>Шаг 5 · вердикт и решение мастера</Eyebrow>
          </Reveal>
          <Reveal delay={6}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 20 }}>
              <span style={{ fontFamily: FONT.mono, fontWeight: 500, fontSize: 150, lineHeight: 1, color: C.text, letterSpacing: "-0.05em" }}>
                {TAKE.verdict.score}
              </span>
              <span style={{ fontFamily: FONT.sans, fontSize: 40, color: C.text2 }}>из 100</span>
              <StatusPill color={C.free} size={30}>
                {TAKE.verdict.label}
              </StatusPill>
            </div>
          </Reveal>
          <Reveal delay={20}>
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <CheckRow kind="pass" size={30} title="Что хорошо" detail="Узел и пол очищены от масла, на фото после чисто." />
              <CheckRow kind="warn" size={30} title="Что проверить" detail="Время работ меньше норматива: мастер видит это в отчёте." />
            </div>
          </Reveal>
          <Reveal delay={60}>
            <Lead size={28}>
              Уверенность {TAKE.verdict.confidencePct}%. Ниже 60% наряд получил бы пометку «Нужна проверка мастером».
            </Lead>
          </Reveal>
          <Reveal delay={CLOSE - 8}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 6 }}>
              <Headline size={60}>Последнее слово за мастером</Headline>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <span
                  style={{
                    fontFamily: FONT.sans,
                    fontWeight: 600,
                    fontSize: 28,
                    color: "#000",
                    background: "#fff",
                    padding: "12px 26px",
                    borderRadius: 999,
                  }}
                >
                  Согласен, закрыть
                </span>
                <StatusPill color={C.off}>Закрыт</StatusPill>
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
