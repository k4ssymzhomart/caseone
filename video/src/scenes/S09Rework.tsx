// 1:40 Phone C, worker 2002, closes the К-2 bearing order without a photo and with 6 bearings: rework, two reasons.
import React from "react";
import { AbsoluteFill } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Split } from "../components/layout";
import { DeviceLabel, Phone, type Shot } from "../components/Phone";
import { CheckRow, Eyebrow, Headline, Lead, Reveal, StatusPill } from "../components/text";
import { TAKE } from "../data/take";
import { C, FONT } from "../theme";

const VERDICT = 150;

const C_SHOTS: Shot[] = [
  {
    still: "mobile/20-worker-close-overuse.png",
    at: 0,
    taps: [
      { at: 28, x: 0.85, y: 0.525 },
      { at: 52, x: 0.85, y: 0.525 },
      { at: 112, x: 0.5, y: 0.953 },
    ],
  },
  { still: "mobile/21-worker-ai-rework.png", at: VERDICT },
  { still: "mobile/22-worker-ai-rework-feedback.png", at: 320 },
];
const A_SHOTS: Shot[] = [
  { still: "mobile/04-master-board-done.png", at: 0 },
  { still: "mobile/23-master-rework-reasons.png", at: VERDICT + 30 },
];

export const S09Rework: React.FC = () => (
  <AbsoluteFill>
    <Backdrop variant="glow" />
    <Split
      leftWidth={640}
      gap={40}
      left={
        <>
          <Reveal>
            <Eyebrow>Шаг 6 · если работа не доказана</Eyebrow>
          </Reveal>
          <Reveal delay={6}>
            <Headline size={80}>Без фото и с перерасходом не закрыть</Headline>
          </Reveal>
          <Reveal delay={VERDICT}>
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <span style={{ fontFamily: FONT.mono, fontWeight: 500, fontSize: 96, lineHeight: 1, color: C.text, letterSpacing: "-0.05em" }}>
                {TAKE.rework.score}
              </span>
              <span style={{ fontFamily: FONT.sans, fontSize: 34, color: C.text2 }}>из 100</span>
              <StatusPill color={C.red} size={28}>
                Требует доработки
              </StatusPill>
            </div>
          </Reveal>
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <Reveal delay={VERDICT + 30}>
              <CheckRow kind="fail" size={32} title="Полнота отчёта" detail="нет фото после: обязательно для внеплановых работ" />
            </Reveal>
            <Reveal delay={VERDICT + 54}>
              <CheckRow
                kind="fail"
                size={32}
                title="Материалы"
                detail={`перерасход: ${TAKE.rework.bearing} ${TAKE.rework.bearings} шт при норме до ${TAKE.rework.normMax}`}
              />
            </Reveal>
          </div>
          <Reveal delay={VERDICT + 100}>
            <Lead size={30}>Жёсткие отказы решают правила, не модель: никакой ответ модели их не отменит.</Lead>
          </Reveal>
        </>
      }
      right={
        <>
          <Phone screenHeight={800} slot="s09-rework-C" shots={C_SHOTS} label={<DeviceLabel letter="C" role="Исполнитель" account="2002" tone={C.queue} />} />
          <Phone screenHeight={800} slot="s09-rework-A" shots={A_SHOTS} label={<DeviceLabel letter="A" role="Мастер" account="1001" />} />
        </>
      }
    />
  </AbsoluteFill>
);
