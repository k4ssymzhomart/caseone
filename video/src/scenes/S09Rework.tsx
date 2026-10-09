// 1:33 Phone C, worker 2002, closes «Конвейер К-2» (№641) without a photo and with 6 bearings; the AI returns it.
// Phone A was recorded after the verdict, so it slides in only once C shows «Требует доработки». Times are seconds of
// s09-rework-C.mp4; the 8,32 s wait for the verdict is cut at 9,3 s (docs/live-loop-timings.md, interval 10).
import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Split } from "../components/layout";
import { DeviceLabel, Phone, type Shot } from "../components/Phone";
import { CheckRow, Eyebrow, Headline, Lead, Mono, Reveal, StatusPill } from "../components/text";
import { at } from "../data/footage";
import { formatRu } from "../data/numbers";
import { TAKE } from "../data/take";
import { C, FONT, ease } from "../theme";

const SLOT_C = "s09-rework-C";
const OVERUSE = at(SLOT_C, 4.3); // the count reaches 6 and the form says «Больше нормы: до 2»
const NO_PHOTO = at(SLOT_C, 7.2); // «Отправить без фото после?»
const VERDICT = at(SLOT_C, 9.3);
const A_IN = VERDICT + 12;

const C_SHOTS: Shot[] = [
  {
    still: "mobile/20-worker-close-overuse.png",
    at: 0,
    taps: [
      { at: OVERUSE - 24, x: 0.85, y: 0.525 },
      { at: OVERUSE, x: 0.85, y: 0.525 },
      { at: NO_PHOTO, x: 0.5, y: 0.953 },
    ],
  },
  { still: "mobile/21-worker-ai-rework.png", at: VERDICT },
  { still: "mobile/22-worker-ai-rework-feedback.png", at: VERDICT + 90 },
];
const A_SHOTS: Shot[] = [
  { still: "mobile/04-master-board-done.png", at: 0 },
  { still: "mobile/23-master-rework-reasons.png", at: A_IN + 20 },
];

const PHONE_SHIFT = 224; // half of a phone (392 px) and the gap (56 px): C sits in the middle until A arrives

export const S09Rework: React.FC = () => {
  const frame = useCurrentFrame();
  const slide = interpolate(frame, [A_IN - 6, A_IN + 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(...ease.inOut),
  });
  return (
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
              <Headline size={76}>Без фото и с перерасходом не закрыть</Headline>
            </Reveal>
            <div style={{ position: "relative", height: 470 }}>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", gap: 24 }}>
                <Reveal delay={OVERUSE} exitAt={VERDICT - 12}>
                  <CheckRow kind="warn" size={30} title="Форма предупреждает" detail="«Больше нормы: до 2», подшипник 3626, 6 шт" />
                </Reveal>
                <Reveal delay={NO_PHOTO} exitAt={VERDICT - 12}>
                  <CheckRow kind="warn" size={30} title="«Отправить без фото после?»" detail="Можно, но для внеплановых работ ИИ вернёт наряд" />
                </Reveal>
              </div>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", gap: 22 }}>
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
                <Reveal delay={VERDICT + 6}>
                  <Mono size={21} color={C.text3} weight={400}>
                    вердикт через {formatRu(TAKE.live.reworkSubmitToVerdict, 1)} с · ожидание вырезано
                  </Mono>
                </Reveal>
                <Reveal delay={VERDICT + 18}>
                  <CheckRow kind="fail" size={30} title="Полнота отчёта" detail="нет фото после: обязательно для внеплановых работ" />
                </Reveal>
                <Reveal delay={VERDICT + 34}>
                  <CheckRow
                    kind="fail"
                    size={30}
                    title="Материалы"
                    detail={`перерасход: ${TAKE.rework.bearing} ${TAKE.rework.bearings} шт при норме до ${TAKE.rework.normMax}`}
                  />
                </Reveal>
                <Reveal delay={VERDICT + 60}>
                  <Lead size={28}>Жёсткие отказы решают правила, не модель: никакой ответ модели их не отменит.</Lead>
                </Reveal>
              </div>
            </div>
          </>
        }
        right={
          <>
            <div style={{ translate: `${PHONE_SHIFT * (1 - slide)}px 0` }}>
              <Phone
                screenHeight={800}
                slot={SLOT_C}
                shots={C_SHOTS}
                label={<DeviceLabel letter="C" role="Исполнитель" account="2002" tone={C.queue} />}
              />
            </div>
            <div style={{ opacity: slide, translate: `${PHONE_SHIFT * (1 - slide)}px 0` }}>
              <Phone
                screenHeight={800}
                slot="s09-rework-A"
                shots={A_SHOTS}
                startAt={A_IN}
                label={<DeviceLabel letter="A" role="Мастер" account="1001" />}
              />
            </div>
          </>
        }
      />
    </AbsoluteFill>
  );
};
