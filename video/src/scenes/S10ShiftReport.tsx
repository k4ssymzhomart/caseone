// 1:46 Web panel, shift report of the night 08.10 (20:00 to 08:00) as master 1001: counters from SQL, the summary
// Claude Sonnet 5.5 wrote for this window, workload and downtime. The quote is the first two sentences of that summary
// as s10-shift-report-web.mp4 shows it (model line «claude-sonnet-5-5, 08:09»).
import React from "react";
import { AbsoluteFill } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Browser, WEB_H, WEB_W } from "../components/Browser";
import { Logo, LogoChip } from "../components/brand";
import { Split } from "../components/layout";
import { Eyebrow, Glass, Headline, Lead, Mono, Reveal } from "../components/text";
import { at } from "../data/footage";
import { C, FONT } from "../theme";

const SLOT = "s10-shift-report-web";

export const S10ShiftReport: React.FC = () => (
  <AbsoluteFill>
    <Backdrop variant="glow" />
    <Split
      leftWidth={446}
      gap={50}
      left={
        <>
          <Reveal>
            <Eyebrow>Веб панель · смена</Eyebrow>
          </Reveal>
          <Reveal delay={6}>
            <Headline size={68}>Смена в цифрах и словах</Headline>
          </Reveal>
          <Reveal delay={at(SLOT, 2.6)}>
            <Glass style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Logo name="claude" size={26} />
                <Mono size={19} color={C.text2}>
                  Сводка ИИ · ночь 08.10
                </Mono>
              </div>
              <span style={{ fontFamily: FONT.sans, fontSize: 25, lineHeight: 1.36, color: C.text }}>
                «За ночную смену выдано 18 нарядов, принято в работу 16, исполнено и закрыто 12. Просроченных и
                отклонённых нарядов нет, в срок выполнено 100% исполненных нарядов.»
              </span>
              <span style={{ fontFamily: FONT.sans, fontSize: 21, lineHeight: 1.35, color: C.text2 }}>
                Sonnet пишет её по цифрам отчёта и добавляет три рекомендации на следующую смену.
              </span>
            </Glass>
          </Reveal>
          <Reveal delay={at(SLOT, 8.6)}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <LogoChip name="pdf" text="Скачать PDF" size={24} />
              <LogoChip name="xlsx" text="Скачать Excel" size={24} />
            </div>
          </Reveal>
          <Reveal delay={at(SLOT, 9.6)}>
            <Lead size={24}>Отчёт смены совпал с ручным подсчётом в SQL во всех 5 окнах проверки.</Lead>
          </Reveal>
        </>
      }
      right={
        <Browser
          slot={SLOT}
          url="rota-naryad.netlify.app/reports/shift"
          width={WEB_W}
          height={WEB_H}
          shots={[
            {
              still: "web-live/w04-shift-report.png",
              at: 0,
              scroll: [
                [0, 0],
                [80, 0],
                [230, 0.34],
              ],
            },
          ]}
        />
      }
    />
  </AbsoluteFill>
);
