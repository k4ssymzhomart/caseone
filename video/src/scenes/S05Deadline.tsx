// 0:55 Deadline control: a second order with the «1 мин» demo deadline, the reminder, then the overdue message on
// both phones. Over stills the toasts are printed by the app's own templates (packages/shared), word for word.
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { renderOrderNotification, type TemplateOrder } from "../../../packages/shared/src/domain/templates";
import { Backdrop } from "../components/Backdrop";
import { Split } from "../components/layout";
import { DeviceLabel, Phone, type HudToast, type Shot } from "../components/Phone";
import { Eyebrow, Glass, Headline, Mono, Reveal } from "../components/text";
import { TAKE } from "../data/take";
import { C, FONT } from "../theme";

const DEADLINE = 240; // the frame where the 1 minute runs out
const REMIND = 120; // 30 s left

const order: TemplateOrder = {
  id: TAKE.deadlineNo,
  number: TAKE.deadlineNo,
  priority: "high",
  status: "queued",
  due_at: TAKE.deadlineOrder.dueUtc,
  last_comment: null,
  equipment_name: TAKE.deadlineOrder.equipment,
  area_name: TAKE.deadlineOrder.area,
  assignee_short_name: "Ахметов Е.",
};

const reminder = renderOrderNotification("reminder", order, { minutes: 1 });
const overdue = renderOrderNotification("overdue", order, { minutes: 1, status_since: TAKE.deadlineOrder.queuedAt });

const B_TOASTS: HudToast[] = [
  { at: REMIND, until: REMIND + 96, title: reminder.title, body: reminder.body, tone: "warning" },
  { at: DEADLINE + 8, until: 410, title: overdue.title, body: overdue.body, tone: "critical" },
];
const A_TOASTS: HudToast[] = [{ at: DEADLINE + 12, until: 410, title: overdue.title, body: overdue.body, tone: "critical" }];

// The master sees №661 in progress, the same moment as phone B (the board still of pwa/07 is from before «Принять»).
const A_SHOTS: Shot[] = [{ still: "pwa/11-A-order-in-progress.png", at: 0 }];
const B_SHOTS: Shot[] = [{ still: "pwa/12-B-order-in-progress.png", at: 0 }];

const Clock: React.FC = () => {
  const frame = useCurrentFrame();
  const over = frame >= DEADLINE;
  const secLeft = Math.ceil(60 * (1 - frame / DEADLINE));
  const overSec = Math.min(59, Math.floor(((frame - DEADLINE) / 30) * 8));
  const pad = (n: number) => String(n).padStart(2, "0");
  const shown = over ? `+00:${pad(overSec)}` : secLeft >= 60 ? "01:00" : `00:${pad(secLeft)}`;
  const pulse = over ? 0.75 + 0.25 * Math.abs(Math.sin(frame / 6)) : 1;
  const progress = Math.min(1, frame / DEADLINE);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 22 }}>
        <span
          style={{
            fontFamily: FONT.mono,
            fontWeight: 500,
            fontSize: 136,
            lineHeight: 1,
            letterSpacing: "-0.05em",
            color: over ? C.red : frame >= REMIND ? C.warning : C.text,
            opacity: pulse,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {shown}
        </span>
      </div>
      <div style={{ height: 8, width: 560, borderRadius: 99, background: C.muted, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${progress * 100}%`,
            background: over ? C.red : frame >= REMIND ? C.warning : C.text2,
          }}
        />
      </div>
      <Mono size={22} color={C.text3} weight={400}>
        демо срок 1 мин · в фильме минута сжата
      </Mono>
    </div>
  );
};

const Rule: React.FC<{ at: number; text: string; tone: string }> = ({ at, text, tone }) => {
  const frame = useCurrentFrame();
  const on = interpolate(frame, [at, at + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 16px",
        borderRadius: 999,
        border: `1px solid ${on > 0.5 ? `${tone}99` : C.hairline}`,
        background: on > 0.5 ? `${tone}22` : "transparent",
        fontFamily: FONT.sans,
        fontSize: 23,
        color: on > 0.5 ? C.text : C.text3,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 10, height: 10, borderRadius: 99, background: on > 0.5 ? tone : C.control }} />
      {text}
    </span>
  );
};

/** The message the phones just got, large enough to read, word for word from the template. */
const Message: React.FC = () => {
  const frame = useCurrentFrame();
  const current = frame >= DEADLINE + 8 ? overdue : frame >= REMIND ? reminder : null;
  const at = frame >= DEADLINE + 8 ? DEADLINE + 8 : REMIND;
  const p = interpolate(frame, [at, at + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const tone = current === overdue ? C.red : C.warning;
  return (
    <div style={{ minHeight: 210 }}>
      {current ? (
        <Glass
          style={{
            padding: "22px 26px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            opacity: p,
            translate: `0 ${(1 - p) * 18}px`,
            borderColor: `${tone}88`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 12, height: 12, borderRadius: 99, background: tone }} />
            <span style={{ fontFamily: FONT.sans, fontWeight: 700, fontSize: 28, color: C.text }}>{current.title}</span>
            <Mono size={20} color={C.text3} weight={400}>
              {current === overdue ? "исполнителю и мастеру" : "исполнителю"}
            </Mono>
          </div>
          <span style={{ fontFamily: FONT.sans, fontSize: 25, lineHeight: 1.36, color: C.text }}>{current.body}</span>
        </Glass>
      ) : null}
    </div>
  );
};

export const S05Deadline: React.FC = () => (
  <AbsoluteFill>
    <Backdrop variant="glow" />
    <Split
      leftWidth={660}
      gap={40}
      left={
        <>
          <Reveal>
            <Eyebrow>Шаг 3 · ИИ контроль сроков</Eyebrow>
          </Reveal>
          <Reveal delay={6}>
            <Headline size={84}>Срок под наблюдением</Headline>
          </Reveal>
          <Reveal delay={10}>
            <Clock />
          </Reveal>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <Rule at={16} text="проверка каждые 5 с" tone={C.text2} />
            <Rule at={REMIND} text="напоминание до срока" tone={C.warning} />
            <Rule at={DEADLINE + 8} text="просрочка" tone={C.red} />
            <Rule at={330} text="эскалация за 3 мин" tone={C.queue} />
          </div>
          <Message />
        </>
      }
      right={
        <>
          <Phone
            screenHeight={800}
            slot="s05-deadline-A"
            shots={A_SHOTS}
            toasts={A_TOASTS}
            label={<DeviceLabel letter="A" role="Мастер" account="1001" />}
          />
          <Phone
            screenHeight={800}
            slot="s05-deadline-B"
            shots={B_SHOTS}
            toasts={B_TOASTS}
            label={<DeviceLabel letter="B" role="Исполнитель" account="2001" />}
          />
        </>
      }
    />
  </AbsoluteFill>
);
