// 1:09 Phone B: closing the order with the fault code, materials against the norm and the after photo.
import React from "react";
import { AbsoluteFill } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Split } from "../components/layout";
import { DeviceLabel, Phone, type Shot } from "../components/Phone";
import { Eyebrow, Headline, Lead, Reveal } from "../components/text";
import { C, FONT } from "../theme";

const SHOTS: Shot[] = [
  { still: "pwa/14-B-close-materials.png", at: 0, taps: [{ at: 44, x: 0.9, y: 0.276 }] },
  {
    still: "pwa/15-B-close-after-photo.png",
    at: 104,
    taps: [
      { at: 150, x: 0.46, y: 0.53 },
      { at: 236, x: 0.5, y: 0.94 },
    ],
  },
];

const Item: React.FC<{ delay: number; tag: string; title: string; detail: string }> = ({ delay, tag, title, detail }) => (
  <Reveal delay={delay}>
    <div style={{ display: "flex", gap: 22, alignItems: "flex-start" }}>
      <span
        style={{
          flex: "none",
          minWidth: 96,
          textAlign: "center",
          padding: "8px 14px",
          borderRadius: 10,
          border: `1.5px solid ${C.hairlineStrong}`,
          fontFamily: FONT.mono,
          fontWeight: 500,
          fontSize: 24,
          color: C.text,
          marginTop: 4,
        }}
      >
        {tag}
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontFamily: FONT.sans, fontWeight: 600, fontSize: 36, color: C.text }}>{title}</span>
        <span style={{ fontFamily: FONT.sans, fontSize: 27, color: C.text2, lineHeight: 1.3 }}>{detail}</span>
      </div>
    </div>
  </Reveal>
);

export const S06Close: React.FC = () => (
  <AbsoluteFill>
    <Backdrop variant="glow" />
    <Split
      leftWidth={820}
      left={
        <>
          <Reveal>
            <Eyebrow>Шаг 4 · исполнитель закрывает наряд</Eyebrow>
          </Reveal>
          <Reveal delay={6}>
            <Headline>Отчёт и фото с телефона</Headline>
          </Reveal>
          <div style={{ display: "flex", flexDirection: "column", gap: 30, marginTop: 10 }}>
            <Item delay={18} tag="Г-01" title="Шифр из справочника" detail="Течь масла, повреждение РВД. Подсказка пришла с выдачи." />
            <Item delay={48} tag="шт · л" title="Материалы рядом с нормой" detail="Обычный расход и максимум видны прямо в форме." />
            <Item delay={110} tag="фото" title="Фото после: камера, сжатие, хеш" detail="1600 px, sha256 и dHash. Загрузка идёт, пока заполняется форма." />
          </div>
          <Reveal delay={200}>
            <Lead size={28}>Фото после обязательно для внеплановых работ: так требует кейс.</Lead>
          </Reveal>
        </>
      }
      right={
        <Phone
          screenHeight={840}
          slot="s06-close-B"
          shots={SHOTS}
          label={<DeviceLabel letter="B" role="Исполнитель" account="2001" />}
        />
      }
    />
  </AbsoluteFill>
);
