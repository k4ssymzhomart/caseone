// 2:05 Web panel, the manager dashboard («Сводка») as руководитель 3001 for «Месяц»: the tiles, the top 5 problem
// units and the best workers. Every number below is the one s12-dashboard-web.mp4 shows (month to 09.10 09:54).
import React from "react";
import { AbsoluteFill } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Browser, WEB_H, WEB_W } from "../components/Browser";
import { Split } from "../components/layout";
import { Eyebrow, Headline, Mono, Reveal } from "../components/text";
import { at } from "../data/footage";
import { C, FONT } from "../theme";

const SLOT = "s12-dashboard-web";

const ROWS: Array<{ t: number; value: string; label: string }> = [
  { t: 1.2, value: "7 · 0", label: "в работе · просрочено" },
  { t: 3.0, value: "12 мин", label: "реакция, от выдачи до принятия" },
  { t: 4.6, value: "89%", label: "в срок, закрыто 178 нарядов" },
  { t: 8.6, value: "32,3 ч", label: "простой Конвейера К-3, 7 внеплановых" },
  { t: 10.6, value: "91,1", label: "лучший исполнитель, Петренко В." },
];

export const S12Dashboard: React.FC = () => (
  <AbsoluteFill>
    <Backdrop variant="glow" />
    <Split
      leftWidth={446}
      gap={50}
      left={
        <>
          <Reveal>
            <Eyebrow>Руководитель · месяц</Eyebrow>
          </Reveal>
          <Reveal delay={6}>
            <Headline size={68}>Вся служба на одном экране</Headline>
          </Reveal>
          <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 6 }}>
            {ROWS.map((r) => (
              <Reveal key={r.label} delay={at(SLOT, r.t)}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontFamily: FONT.mono, fontWeight: 500, fontSize: 44, color: C.text, letterSpacing: "-0.03em" }}>
                    {r.value}
                  </span>
                  <Mono size={21} color={C.text2} weight={400}>
                    {r.label}
                  </Mono>
                </div>
              </Reveal>
            ))}
          </div>
        </>
      }
      right={
        <Browser
          slot={SLOT}
          url="rota-naryad.netlify.app/dashboard"
          width={WEB_W}
          height={WEB_H}
          shots={[]}
        />
      }
    />
  </AbsoluteFill>
);
