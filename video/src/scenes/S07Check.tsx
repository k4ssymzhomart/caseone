// 1:14 The AI check of №660 as it ran: the phone ticks report, photo and materials, the verdict lands at 7,4 s of
// s07-check.mp4, 8,49 s after «Отправить на проверку» (docs/live-loop-timings.md, interval 6). Rule points and the
// model's parts are the review of the take (src/data/take.ts, verdictDetails).
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Logo } from "../components/brand";
import { Stopwatch } from "../components/CountUp";
import { Split } from "../components/layout";
import { DeviceLabel, Phone } from "../components/Phone";
import { Eyebrow, Glass, Headline, Lead, Mono, Reveal } from "../components/text";
import { at } from "../data/footage";
import { NUMBERS } from "../data/numbers";
import { TAKE } from "../data/take";
import { C, FONT } from "../theme";

const SLOT = "s07-check-B";
const VERDICT = at(SLOT, 7.4);
/** Seconds between the tap and the first frame of the clip. */
const BEFORE = TAKE.live.submitToVerdict - 7.4;

const check = (id: string) => TAKE.verdictDetails.checks.find((c) => c.id === id)!;

// The phone ticks «Полнота отчёта», «Фото», «Материалы» at 0,5 s, 1,4 s and 2,2 s; «Время» waits for the verdict.
const RULES = [
  { at: at(SLOT, 0.5), c: check("R1"), title: "Полнота отчёта", note: "" },
  { at: at(SLOT, 1.4), c: check("R2"), title: "Подлинность фото", note: "из галереи" },
  { at: at(SLOT, 2.2), c: check("R3"), title: "Материалы в норме", note: "" },
  { at: VERDICT, c: check("R4"), title: "Время и срок", note: "5 мин при нормативе 3" },
];

const RuleRow: React.FC<(typeof RULES)[number]> = ({ at: shownAt, c, title, note }) => {
  const frame = useCurrentFrame();
  const on = interpolate(frame, [shownAt, shownAt + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const kind = c.status === "pass" ? "pass" : "warn";
  const tone = kind === "pass" ? C.free : C.warning;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, opacity: 0.35 + 0.65 * on }}>
      <span
        style={{
          flex: "none",
          width: 38,
          height: 38,
          borderRadius: 99,
          display: "grid",
          placeItems: "center",
          background: on > 0.5 ? `${tone}30` : C.muted,
          color: on > 0.5 ? tone : C.text3,
          fontFamily: FONT.sans,
          fontWeight: 700,
          fontSize: 22,
        }}
      >
        {on > 0.5 ? (kind === "pass" ? "✓" : "!") : "…"}
      </span>
      <span style={{ fontFamily: FONT.sans, fontWeight: 600, fontSize: 29, color: C.text, flex: 1, whiteSpace: "nowrap" }}>
        {title}
        {note && on > 0.5 ? <span style={{ fontWeight: 400, color: C.text2 }}> · {note}</span> : null}
      </span>
      <Mono size={24} color={on > 0.5 ? C.text : C.text3}>
        {on > 0.5 ? `${c.points} из ${c.max}` : `… из ${c.max}`}
      </Mono>
    </div>
  );
};

const ModelCard: React.FC = () => {
  const frame = useCurrentFrame();
  const done = frame >= VERDICT;
  const l1 = check("L1");
  const l2 = check("L2");
  return (
    <Glass style={{ padding: "22px 28px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Logo name="claude" size={32} />
        <span style={{ fontFamily: FONT.sans, fontWeight: 700, fontSize: 30, color: C.text }}>Claude Sonnet 5.5</span>
        <Mono size={21} color={C.text3} weight={400}>
          фото до и после, текст, шифр
        </Mono>
      </div>
      <div style={{ display: "flex", gap: 34, alignItems: "baseline" }}>
        <Mono size={24} color={done ? C.text : C.text3}>
          {done ? `работы ${l1.points} из ${l1.max}` : `работы … из ${l1.max}`}
        </Mono>
        <Mono size={24} color={done ? C.text : C.text3}>
          {done ? `фото после ${l2.points} из ${l2.max}` : `фото после … из ${l2.max}`}
        </Mono>
        {!done ? (
          <Mono size={22} color={C.text3} weight={400}>
            {".".repeat(1 + (Math.floor(frame / 10) % 3))}
          </Mono>
        ) : null}
      </div>
    </Glass>
  );
};

export const S07Check: React.FC = () => (
  <AbsoluteFill>
    <Backdrop variant="glow" />
    <Split
      leftWidth={860}
      left={
        <>
          <Reveal>
            <Eyebrow>Проверка ИИ · наряд №{TAKE.emergencyNo}</Eyebrow>
          </Reveal>
          <Reveal delay={6}>
            <Headline size={80}>Правила решают, модель оценивает</Headline>
          </Reveal>
          <Reveal delay={10}>
            <Glass style={{ padding: "22px 30px", display: "flex", flexDirection: "column", gap: 14 }}>
              <Eyebrow size={20} color={C.text2} dot={false}>
                Правила R1…R4 в SQL
              </Eyebrow>
              {RULES.map((r) => (
                <RuleRow key={r.title} {...r} />
              ))}
            </Glass>
          </Reveal>
          <Reveal delay={40}>
            <ModelCard />
          </Reveal>
          <Reveal delay={4}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 22 }}>
              <Stopwatch start={0} from={BEFORE} stop={NUMBERS.verdict.value} size={96} color={C.red} runningColor={C.text} />
              <Lead size={26}>{NUMBERS.verdict.label}</Lead>
            </div>
          </Reveal>
        </>
      }
      right={
        <Phone
          screenHeight={840}
          slot={SLOT}
          shots={[{ still: "pwa/16-B-sent-for-review.png", at: 0 }]}
          label={<DeviceLabel letter="B" role="Исполнитель" account="2001" />}
        />
      }
    />
  </AbsoluteFill>
);
