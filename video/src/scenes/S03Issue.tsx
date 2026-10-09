// 0:22 Phone A, master 1001: an emergency order in 5 taps, the AI suggests Ахметов.
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Split } from "../components/layout";
import { DeviceLabel, Phone, type Shot } from "../components/Phone";
import { Eyebrow, Glass, Headline, Mono, Reveal, StatusPill } from "../components/text";
import { C, FONT, T } from "../theme";

const TAPS = [
  { at: 60, label: "Выдать", hint: "вкладка" },
  { at: 120, label: "Аварийный", hint: "пресет" },
  { at: 196, label: "Насос НШ-32 маслостанции", hint: "оборудование" },
  { at: 268, label: "Течь масла", hint: "шаблон проблемы" },
  { at: 430, label: "Выдать", hint: "исполнитель и срок уже выбраны" },
];

const SHOTS: Shot[] = [
  { still: "mobile/02-master-shift.png", at: 0, taps: [{ at: TAPS[0].at, x: 0.62, y: 0.924 }] },
  {
    still: "mobile/07-master-create.png",
    at: 72,
    taps: [
      { at: TAPS[1].at, x: 0.175, y: 0.275 },
      { at: TAPS[2].at, x: 0.34, y: 0.65 },
    ],
  },
  {
    still: "mobile/08-master-create-ai-suggestion.png",
    at: 232,
    taps: [
      { at: TAPS[3].at, x: 0.32, y: 0.29 },
      { at: TAPS[4].at, x: 0.5, y: 0.905 },
    ],
  },
  { still: "pwa/05-A-after-issue.png", at: 446 },
];

const TapRow: React.FC<{ n: number; label: string; hint: string; at: number }> = ({ n, label, hint, at }) => {
  const frame = useCurrentFrame();
  const on = interpolate(frame, [at - 2, at + 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 22, opacity: 0.32 + 0.68 * on }}>
      <span
        style={{
          width: 46,
          height: 46,
          borderRadius: 12,
          display: "grid",
          placeItems: "center",
          fontFamily: FONT.mono,
          fontWeight: 600,
          fontSize: 26,
          color: on > 0.5 ? "#fff" : C.text2,
          background: on > 0.5 ? C.red : C.muted,
          scale: String(1 + 0.12 * Math.max(0, 1 - Math.abs(frame - at) / 8)),
        }}
      >
        {n}
      </span>
      <span style={{ fontFamily: FONT.sans, fontWeight: 600, fontSize: 31, color: C.text }}>{label}</span>
      <span style={{ fontFamily: FONT.sans, fontSize: 24, color: C.text3 }}>{hint}</span>
    </div>
  );
};

export const S03Issue: React.FC = () => {
  return (
    <AbsoluteFill>
      <Backdrop variant="glow" />
      <Split
        leftWidth={860}
        left={
          <>
            <Reveal>
              <Eyebrow>Шаг 1 · мастер выдаёт наряд</Eyebrow>
            </Reveal>
            <Reveal delay={6}>
              <Headline>
                Аварийный наряд
                <br />
                за <span style={{ fontFamily: FONT.mono, fontWeight: 500, color: C.red }}>5</span> нажатий
              </Headline>
            </Reveal>
            <Reveal delay={12}>
              <Mono size={T.small} color={C.text3} weight={400}>
                Требование кейса: не больше 6 нажатий и 1 минуты.
                <br />
                Участок нужен, только если узла нет среди недавних: тогда 6.
              </Mono>
            </Reveal>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {TAPS.map((t, i) => (
                <TapRow key={t.at} n={i + 1} label={t.label} hint={t.hint} at={t.at} />
              ))}
            </div>
            <Reveal delay={300}>
              <Glass style={{ padding: "22px 28px", display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <Eyebrow size={20}>ИИ предлагает исполнителя</Eyebrow>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                  <span style={{ fontFamily: FONT.sans, fontWeight: 700, fontSize: 36, color: C.text }}>Ахметов Е.</span>
                  <StatusPill color={C.free}>Свободен</StatusPill>
                </div>
                <span style={{ fontFamily: FONT.sans, fontSize: 25, color: C.text2, lineHeight: 1.35 }}>
                  Слесарь 5 разряда · 6 нарядов по насосам, средняя оценка 4,4 · сегодня работал на этом участке
                </span>
              </Glass>
            </Reveal>
          </>
        }
        right={
          <Phone
            screenHeight={820}
            slot="s03-issue-A"
            shots={SHOTS}
            label={<DeviceLabel letter="A" role="Мастер" account="1001" />}
          />
        }
      />
    </AbsoluteFill>
  );
};
