// 0:20 Phone A, master 1001: the emergency order of the take, 6 taps in 15 s by the app's own counter, the AI suggests
// Ахметов. Tap times are the frames of s03-issue.mp4 where each tap shows (the sixth tap is the optional «Фото до»).
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Split } from "../components/layout";
import { DeviceLabel, Phone, type Shot } from "../components/Phone";
import { Eyebrow, Glass, Headline, Mono, Reveal, StatusPill } from "../components/text";
import { at } from "../data/footage";
import { TAKE } from "../data/take";
import { C, FONT, T } from "../theme";

const SLOT = "s03-issue-A";

// Seconds of s03-issue.mp4 where each tap lands.
const TAPS = [
  { t: 2.07, label: "Выдать", hint: "вкладка" },
  { t: 4.15, label: "Аварийный", hint: "пресет" },
  { t: 6.8, label: "Насос НШ-32 маслостанции", hint: "оборудование" },
  { t: 9.6, label: "Течь масла", hint: "шаблон проблемы" },
  { t: 14.68, label: "Фото до", hint: "по желанию" },
  { t: 17.53, label: "Выдать", hint: "исполнитель и срок уже выбраны" },
].map((tap) => ({ ...tap, at: at(SLOT, tap.t) }));

/** The AI suggestion card renders under the problem chips at 10,6 s of the take. */
const SUGGEST = at(SLOT, 10.6);

const SHOTS: Shot[] = [
  { still: "mobile/02-master-shift.png", at: 0, taps: [{ at: TAPS[0].at, x: 0.62, y: 0.924 }] },
  {
    still: "mobile/07-master-create.png",
    at: TAPS[0].at + 12,
    taps: [
      { at: TAPS[1].at, x: 0.175, y: 0.275 },
      { at: TAPS[2].at, x: 0.34, y: 0.65 },
    ],
  },
  {
    still: "mobile/08-master-create-ai-suggestion.png",
    at: TAPS[2].at + 36,
    taps: [
      { at: TAPS[3].at, x: 0.32, y: 0.29 },
      { at: TAPS[5].at, x: 0.5, y: 0.905 },
    ],
  },
  { still: "pwa/05-A-after-issue.png", at: TAPS[5].at + 16 },
];

const TapRow: React.FC<{ n: number; label: string; hint: string; at: number }> = ({ n, label, hint, at: tapAt }) => {
  const frame = useCurrentFrame();
  const on = interpolate(frame, [tapAt - 2, tapAt + 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, opacity: 0.32 + 0.68 * on }}>
      <span
        style={{
          flex: "none",
          width: 44,
          height: 44,
          borderRadius: 12,
          display: "grid",
          placeItems: "center",
          fontFamily: FONT.mono,
          fontWeight: 600,
          fontSize: 25,
          color: on > 0.5 ? "#fff" : C.text2,
          background: on > 0.5 ? C.red : C.muted,
          scale: String(1 + 0.12 * Math.max(0, 1 - Math.abs(frame - tapAt) / 8)),
        }}
      >
        {n}
      </span>
      <span style={{ fontFamily: FONT.sans, fontWeight: 600, fontSize: 30, color: C.text, whiteSpace: "nowrap" }}>{label}</span>
      <span style={{ fontFamily: FONT.sans, fontSize: 23, color: C.text3, whiteSpace: "nowrap" }}>{hint}</span>
    </div>
  );
};

/** Taps and seconds since «Выдать» opened, like the counter in the app's own header. */
const Counter: React.FC = () => {
  const frame = useCurrentFrame();
  const taps = TAPS.filter((t) => frame >= t.at).length;
  const sec = Math.max(0, Math.min(TAKE.issue.seconds, Math.floor((frame - TAPS[0].at) / 30)));
  const done = frame >= TAPS[5].at;
  return (
    <span
      style={{
        fontFamily: FONT.mono,
        fontWeight: 500,
        fontSize: 26,
        color: done ? C.text : C.text2,
        padding: "8px 16px",
        borderRadius: 999,
        border: `1px solid ${done ? "rgba(255,59,48,0.6)" : C.hairlineStrong}`,
        background: done ? "rgba(255,59,48,0.14)" : "transparent",
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
      }}
    >
      {taps} {taps === 1 ? "нажатие" : taps >= 2 && taps <= 4 ? "нажатия" : "нажатий"} · 0:{String(sec).padStart(2, "0")}
    </span>
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
              <Headline size={84}>
                Аварийный наряд
                <br />
                за <span style={{ fontFamily: FONT.mono, fontWeight: 500, color: C.red }}>{TAKE.issue.taps}</span> нажатий и{" "}
                <span style={{ fontFamily: FONT.mono, fontWeight: 500, color: C.red }}>{TAKE.issue.seconds}</span> с
              </Headline>
            </Reveal>
            <Reveal delay={12}>
              <Mono size={T.small} color={C.text3} weight={400}>
                Требование кейса: не больше 6 нажатий и 1 минуты.
                <br />
                Шестое нажатие здесь «Фото до»: без фото хватает пяти.
              </Mono>
            </Reveal>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {TAPS.map((t, i) => (
                <TapRow key={t.t} n={i + 1} label={t.label} hint={t.hint} at={t.at} />
              ))}
            </div>
            <div style={{ position: "relative", minHeight: 170 }}>
              <Reveal delay={TAPS[0].at} exitAt={SUGGEST - 12} style={{ position: "absolute", left: 0, top: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <Mono size={20} color={C.text3} weight={400}>
                    СЧЁТЧИК В ПРИЛОЖЕНИИ
                  </Mono>
                  <Counter />
                </div>
              </Reveal>
              <Reveal delay={SUGGEST} style={{ position: "absolute", left: 0, right: 0, top: 0 }}>
                <Glass style={{ padding: "20px 26px", display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                    <Eyebrow size={20}>ИИ предлагает исполнителя</Eyebrow>
                    <Counter />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                    <span style={{ fontFamily: FONT.sans, fontWeight: 700, fontSize: 34, color: C.text }}>Ахметов Е.</span>
                    <StatusPill color={C.free} size={24}>
                      Свободен
                    </StatusPill>
                  </div>
                  <span style={{ fontFamily: FONT.sans, fontSize: 24, color: C.text2, lineHeight: 1.35 }}>
                    Слесарь 5 разряда · 6 нарядов по насосам, средняя оценка 4,4 · сегодня работал на этом участке
                  </span>
                </Glass>
              </Reveal>
            </div>
          </>
        }
        right={
          <Phone
            screenHeight={820}
            slot={SLOT}
            shots={SHOTS}
            label={<DeviceLabel letter="A" role="Мастер" account="1001" />}
          />
        }
      />
    </AbsoluteFill>
  );
};
