// 0:52 Deadline control: a second order with the «1 мин» demo deadline, «В очередь», the reminder, then the overdue
// message on both phones. The recordings keep four moments of the two minute wait (cuts at 2,7 s, 7,6 s and 10,2 s of
// s05-deadline-B.mp4); the clock shows the real time left at each moment (docs/live-loop-timings.md, event log).
// The message card is printed by the app's own templates (packages/shared), word for word.
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { renderOrderNotification, type TemplateOrder } from "../../../packages/shared/src/domain/templates";
import { Backdrop } from "../components/Backdrop";
import { Split } from "../components/layout";
import { DeviceLabel, Phone, type HudToast, type Shot } from "../components/Phone";
import { Eyebrow, Glass, Headline, Mono, Reveal } from "../components/text";
import { at } from "../data/footage";
import { formatRu, NUMBERS } from "../data/numbers";
import { TAKE } from "../data/take";
import { C, FONT } from "../theme";

const B = "s05-deadline-B";
const REMIND = at(B, 7.6); // «Скоро срок №661» slides in on B
const DEADLINE = at(B, 10.2); // «Просрочен №661» on B (A 0,5 s later in its own cut)

/** Seconds left until the deadline of №661 at second `t` of the B recording (negative once overdue). Each moment maps
 * back to the take by one event of the log: B's toast «Новый наряд» (raw 167,56 s), the tap «В очередь» (184,98 s),
 * the reminder (201,21 s) and the overdue toast (230,98 s); the deadline is raw 226,49 s. */
const leftAt = (t: number): number => {
  if (t < 2.7) return Math.min(60, 60.6 - t);
  if (t < 7.6) return 45.54 - t;
  if (t < 10.2) return 32.88 - t;
  return -(t - 10.2 + 4.5);
};

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
  { at: DEADLINE, until: 410, title: overdue.title, body: overdue.body, tone: "critical" },
];
const A_TOASTS: HudToast[] = [{ at: DEADLINE + 14, until: 410, title: overdue.title, body: overdue.body, tone: "critical" }];

// The master sees №661 in progress, the same moment as phone B (the board still of pwa/07 is from before «Принять»).
const A_SHOTS: Shot[] = [{ still: "pwa/11-A-order-in-progress.png", at: 0 }];
const B_SHOTS: Shot[] = [{ still: "pwa/12-B-order-in-progress.png", at: 0 }];

const Clock: React.FC = () => {
  const frame = useCurrentFrame();
  const left = leftAt(frame / 30);
  const over = left < 0;
  const secs = Math.floor(Math.abs(left));
  const pad = (n: number) => String(n).padStart(2, "0");
  const shown = `${over ? "+" : ""}${pad(Math.floor(secs / 60))}:${pad(secs % 60)}`;
  const pulse = over ? 0.75 + 0.25 * Math.abs(Math.sin(frame / 6)) : 1;
  const progress = Math.min(1, (60 - left) / 60);
  const tone = over ? C.red : frame >= REMIND ? C.warning : C.text;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <span
        style={{
          fontFamily: FONT.mono,
          fontWeight: 500,
          fontSize: 124,
          lineHeight: 1,
          letterSpacing: "-0.05em",
          color: tone,
          opacity: pulse,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {shown}
      </span>
      <div style={{ height: 8, width: 560, borderRadius: 99, background: C.muted, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${progress * 100}%`, background: over ? C.red : frame >= REMIND ? C.warning : C.text2 }} />
      </div>
      <Mono size={22} color={C.text3} weight={400}>
        наряд №{TAKE.deadlineNo} · демо срок 1 мин · ожидание вырезано
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
        fontSize: 22,
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
  const current = frame >= DEADLINE ? overdue : frame >= REMIND ? reminder : null;
  const from = frame >= DEADLINE ? DEADLINE : REMIND;
  const p = interpolate(frame, [from, from + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
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
            <Headline size={80}>Срок под наблюдением</Headline>
          </Reveal>
          <Reveal delay={10}>
            <Clock />
          </Reveal>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <Rule at={16} text="проверка каждые 5 с" tone={C.text2} />
            <Rule at={REMIND} text={`напоминание за ${NUMBERS.reminderBefore.value} с`} tone={C.warning} />
            <Rule at={DEADLINE} text={`просрочка через ${formatRu(NUMBERS.overdueAfter.value, 1)} с`} tone={C.red} />
            <Rule at={DEADLINE + 40} text="эскалация мастеру" tone={C.queue} />
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
