// 1:54 Web panel, shift report: numbers from SQL, the summary written by Claude Sonnet 5.5, PDF and Excel export.
// The quoted summary is the live run recorded in docs/phase5-acceptance.md (night shift of 08.10, 6.6 s).
import React from "react";
import { AbsoluteFill } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Browser } from "../components/Browser";
import { Logo, LogoChip } from "../components/brand";
import { Split } from "../components/layout";
import { Eyebrow, Glass, Headline, Lead, Mono, Reveal } from "../components/text";
import { formatRu, NUMBERS } from "../data/numbers";
import { C, FONT } from "../theme";

export const BROWSER_W = 1120;
export const BROWSER_H = 752;

export const S10ShiftReport: React.FC = () => (
  <AbsoluteFill>
    <Backdrop variant="glow" />
    <Split
      leftWidth={500}
      gap={60}
      left={
        <>
          <Reveal>
            <Eyebrow>Веб панель · смена</Eyebrow>
          </Reveal>
          <Reveal delay={6}>
            <Headline size={72}>Смена в цифрах и словах</Headline>
          </Reveal>
          <Reveal delay={40}>
            <Glass style={{ padding: "24px 26px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Logo name="claude" size={26} />
                <Mono size={20} color={C.text2}>
                  Сводка ИИ · ночь 08.10 · {formatRu(NUMBERS.shiftSummarySec.value, 1)} с
                </Mono>
              </div>
              <span style={{ fontFamily: FONT.sans, fontSize: 25, lineHeight: 1.38, color: C.text }}>
                «За ночную смену выдано 9 нарядов, принято в работу 8, исполнено 7, закрыто 5. Просроченных нарядов и
                отказов не было, в срок выполнено 100% исполненных нарядов.»
              </span>
              <span style={{ fontFamily: FONT.sans, fontSize: 22, lineHeight: 1.35, color: C.text2 }}>
                Числа только из отчёта: проверка не нашла ни одного чужого.
              </span>
            </Glass>
          </Reveal>
          <Reveal delay={150}>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <LogoChip name="pdf" text="Скачать PDF" size={26} />
              <LogoChip name="xlsx" text="Скачать Excel" size={26} />
            </div>
          </Reveal>
          <Reveal delay={170}>
            <Lead size={24}>Отчёт смены совпал с ручным подсчётом в SQL во всех 5 окнах проверки.</Lead>
          </Reveal>
        </>
      }
      right={
        <Browser
          slot="s10-shift-report-web"
          url="rota-naryad.netlify.app/reports/shift"
          width={BROWSER_W}
          height={BROWSER_H}
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
