// 0:37 Phones A and B side by side, recorded together: «Выдать» on A, the red screen on B 0,72 s later, «Принять» and
// «Начать исполнение» on B, each status on A within 1,4 s. Times are seconds of s04-accept-A/B.mp4
// (docs/live-loop-timings.md, intervals 1 to 3).
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { LogoChip } from "../components/brand";
import { Stopwatch } from "../components/CountUp";
import { Split } from "../components/layout";
import { DeviceLabel, Phone, type Shot } from "../components/Phone";
import { Eyebrow, Headline, Lead, Mono, Reveal, StatusPill } from "../components/text";
import { at } from "../data/footage";
import { formatRu, NUMBERS } from "../data/numbers";
import { TAKE } from "../data/take";
import { C, FONT, T } from "../theme";

const ISSUE = at("s04-accept-A", 0.38); // A taps «Выдать»
const RED = at("s04-accept-B", 1.1); // B shows the red screen
const ACCEPT = at("s04-accept-B", 7.21);
const START = at("s04-accept-B", 10.98);

const B_SHOTS: Shot[] = [
  { still: "pwa/06-B-emergency-red-screen.png", at: 0, taps: [{ at: ACCEPT, x: 0.5, y: 0.856 }] },
  { still: "pwa/10-B-order-accepted.png", at: ACCEPT + 12, taps: [{ at: START, x: 0.5, y: 0.942 }] },
  { still: "pwa/12-B-order-in-progress.png", at: START + 12 },
];

const A_SHOTS: Shot[] = [
  { still: "pwa/05-A-after-issue.png", at: 0 },
  { still: "pwa/09-A-order-accepted.png", at: ACCEPT + 42 },
  { still: "pwa/11-A-order-in-progress.png", at: START + 35 },
];

const Step: React.FC<{ at: number; delay: number; action: string; status: string; color: string }> = ({
  at: tapAt,
  delay,
  action,
  status,
  color,
}) => {
  const frame = useCurrentFrame();
  const seenAt = tapAt + Math.round(delay * 30);
  const on = interpolate(frame, [tapAt, tapAt + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const seen = interpolate(frame, [seenAt, seenAt + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, opacity: 0.3 + 0.7 * on }}>
      <span
        style={{
          fontFamily: FONT.sans,
          fontWeight: 600,
          fontSize: 26,
          color: "#000",
          background: "#fff",
          padding: "9px 20px",
          borderRadius: 999,
          whiteSpace: "nowrap",
        }}
      >
        {action}
      </span>
      <Mono size={26} color={C.text3}>
        →
      </Mono>
      <span style={{ opacity: 0.35 + 0.65 * seen }}>
        <StatusPill color={color} size={24}>
          {status}
        </StatusPill>
      </span>
      <Mono size={22} color={C.text2} weight={400} style={{ opacity: seen, whiteSpace: "nowrap" }}>
        {formatRu(delay, 2)} с
      </Mono>
    </div>
  );
};

export const S04Accept: React.FC = () => {
  const frame = useCurrentFrame();
  const alarm = frame >= RED && frame < ACCEPT ? 0.6 + 0.4 * Math.abs(Math.sin(frame / 9)) : 0;
  return (
    <AbsoluteFill>
      <Backdrop variant="glow" />
      <AbsoluteFill
        style={{
          background: `radial-gradient(30% 50% at 78% 55%, rgba(255,59,48,${0.28 * alarm}), transparent 70%)`,
        }}
      />
      <Split
        leftWidth={660}
        gap={40}
        left={
          <>
            <Reveal>
              <Eyebrow>Шаг 2 · исполнитель отвечает</Eyebrow>
            </Reveal>
            <Reveal delay={6}>
              <Headline size={84}>Красный экран и сирена</Headline>
            </Reveal>
            <Reveal delay={12}>
              <Lead size={32}>Аварийный наряд не смахнуть: только «Принять» или «Отклонить».</Lead>
            </Reveal>
            <Reveal delay={ISSUE - 6}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 22, marginTop: 6 }}>
                <Stopwatch start={ISSUE} stop={NUMBERS.redScreen.value} decimals={2} size={112} color={C.red} runningColor={C.text} />
                <Lead size={26} style={{ maxWidth: 330 }}>
                  {NUMBERS.redScreen.label}
                </Lead>
              </div>
            </Reveal>
            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 6 }}>
              <Reveal delay={ACCEPT - 30}>
                <Mono size={T.small} color={C.text3} weight={400}>
                  ИСПОЛНИТЕЛЬ НАЖИМАЕТ → МАСТЕР ВИДИТ
                </Mono>
              </Reveal>
              <Step at={ACCEPT} delay={TAKE.live.acceptToMaster} action="Принять" status="Принят в работу" color={C.queue} />
              <Step at={START} delay={TAKE.live.startToMaster} action="Начать исполнение" status="В работе" color={C.working} />
            </div>
            <Reveal delay={START + 40}>
              <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 8 }}>
                <LogoChip name="supabase" text="Realtime" size={28} />
                <Mono size={T.small} color={C.text3} weight={400}>
                  Требование кейса: статус за 5 с
                </Mono>
              </div>
            </Reveal>
          </>
        }
        right={
          <>
            <Phone
              screenHeight={800}
              slot="s04-accept-A"
              shots={A_SHOTS}
              label={<DeviceLabel letter="A" role="Мастер" account="1001" />}
            />
            <Phone
              screenHeight={800}
              slot="s04-accept-B"
              shots={B_SHOTS}
              glow={alarm > 0 ? "rgba(255,59,48,0.5)" : undefined}
              glowStrength={alarm}
              label={<DeviceLabel letter="B" role="Исполнитель" account="2001" />}
            />
          </>
        }
      />
    </AbsoluteFill>
  );
};
