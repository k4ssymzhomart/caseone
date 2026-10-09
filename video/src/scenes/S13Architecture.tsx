// 2:22 Architecture in one animated picture (docs/architecture.md). The privacy gateway close up follows in S13Privacy.
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Logo, Mascot, type MascotName } from "../components/brand";
import { Eyebrow, Headline, Mono, Reveal, useIn } from "../components/text";
import type { PlatformLogoName } from "../../../packages/design/src/brand/platforms";
import { C, FONT } from "../theme";

type Box = { x: number; y: number; w: number; h: number };
type NodeSpec = Box & { at: number; title: string; sub: string; logos?: PlatformLogoName[]; mascot?: MascotName; accent?: boolean };

const CLIENTS: NodeSpec[] = [
  { x: 120, y: 296, w: 410, h: 124, at: 10, title: "Телефон мастера", sub: "выдача, смена, доска", logos: ["android", "apple", "expo"] },
  { x: 120, y: 446, w: 410, h: 124, at: 18, title: "Телефон исполнителя", sub: "сирена, закрытие с фото", logos: ["android", "apple", "expo"] },
  { x: 120, y: 596, w: 410, h: 124, at: 26, title: "Веб панель", sub: "отчёты, рейтинг, аналитика", logos: ["react", "chrome"] },
];

const SB: Box = { x: 650, y: 280, w: 600, h: 470 };

const CHIPS: Array<{ title: string; sub: string }> = [
  { title: "order_action", sub: "машина состояний, RLS" },
  { title: "Realtime", sub: "статус на всех экранах" },
  { title: "pg_cron · 5 с", sub: "наблюдатель сроков" },
  { title: "Storage", sub: "фото по ссылкам" },
  { title: "Edge Functions", sub: "ai-verify, ai-insights" },
  { title: "outbox", sub: "события для 1С" },
];

const RIGHT: NodeSpec[] = [
  { x: 1370, y: 280, w: 430, h: 112, at: 70, title: "Шлюз приватности", sub: "имена → E01, M01", mascot: "shield", accent: true },
  { x: 1370, y: 418, w: 430, h: 112, at: 80, title: "Claude Sonnet 5.5 · Haiku 5.5", sub: "или локальная модель", logos: ["claude"] },
  { x: 1370, y: 556, w: 430, h: 92, at: 92, title: "Push · FCM", sub: "наряды, авария, напоминания", logos: ["expo", "android"] },
  { x: 1370, y: 662, w: 430, h: 92, at: 100, title: "Telegram", sub: "без имён", logos: ["telegram"] },
  { x: 1370, y: 768, w: 430, h: 92, at: 108, title: "1С:ТОиР", sub: "заявка, акт, требование", logos: ["onec"] },
];

type Edge = { at: number; p: [number, number, number, number, number, number, number, number] };

const curve = (x1: number, y1: number, x2: number, y2: number): Edge["p"] => {
  const mx = (x1 + x2) / 2;
  return [x1, y1, mx, y1, mx, y2, x2, y2];
};

const EDGES: Edge[] = [
  { at: 40, p: curve(530, 358, 650, 358) },
  { at: 46, p: curve(530, 508, 650, 508) },
  { at: 52, p: curve(530, 658, 650, 658) },
  { at: 76, p: curve(1250, 336, 1370, 336) },
  { at: 84, p: [1585, 392, 1585, 404, 1585, 406, 1585, 418] },
  { at: 96, p: curve(1250, 602, 1370, 602) },
  { at: 104, p: curve(1250, 680, 1370, 708) },
  { at: 112, p: curve(1250, 730, 1370, 814) },
];

const bez = (e: Edge["p"], t: number): [number, number] => {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = e;
  const u = 1 - t;
  return [
    u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
    u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
  ];
};

const Edges: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
      {EDGES.map((e, i) => {
        const draw = interpolate(frame, [e.at, e.at + 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const d = `M${e.p[0]} ${e.p[1]} C${e.p[2]} ${e.p[3]} ${e.p[4]} ${e.p[5]} ${e.p[6]} ${e.p[7]}`;
        const packets = [0, 0.5].map((off) => ((frame - e.at) / 40 + off + i * 0.13) % 1);
        return (
          <g key={d}>
            <path d={d} pathLength={1} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth={2} strokeDasharray="1" strokeDashoffset={1 - draw} />
            {draw >= 1
              ? packets.map((t) => {
                  const [x, y] = bez(e.p, t);
                  return <circle key={t} cx={x} cy={y} r={5} fill={C.red} style={{ filter: "drop-shadow(0 0 6px rgba(255,59,48,0.9))" }} />;
                })
              : null}
          </g>
        );
      })}
    </svg>
  );
};

const Node: React.FC<{ n: NodeSpec }> = ({ n }) => {
  const p = useIn(n.at, 16);
  return (
    <div
      style={{
        position: "absolute",
        left: n.x,
        top: n.y,
        width: n.w,
        height: n.h,
        opacity: p,
        translate: `0 ${(1 - p) * 16}px`,
        borderRadius: 20,
        background: n.accent ? "rgba(255,59,48,0.12)" : C.subtle,
        border: `1.5px solid ${n.accent ? "rgba(255,59,48,0.6)" : C.hairlineStrong}`,
        display: "flex",
        alignItems: "center",
        gap: 18,
        padding: "0 22px",
      }}
    >
      {n.mascot ? <Mascot name={n.mascot} size={78} /> : null}
      {n.logos ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: "none" }}>
          {n.logos.map((l) => (
            <Logo key={l} name={l} size={n.logos!.length > 2 ? 24 : 30} />
          ))}
        </div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 }}>
        <span style={{ fontFamily: FONT.sans, fontWeight: 700, fontSize: 27, color: C.text, whiteSpace: "nowrap" }}>{n.title}</span>
        <span style={{ fontFamily: FONT.sans, fontSize: 21, color: C.text2, whiteSpace: "nowrap" }}>{n.sub}</span>
      </div>
    </div>
  );
};

const Supabase: React.FC = () => {
  const p = useIn(30, 18);
  return (
    <div
      style={{
        position: "absolute",
        left: SB.x,
        top: SB.y,
        width: SB.w,
        height: SB.h,
        opacity: p,
        scale: String(interpolate(p, [0, 1], [0.97, 1])),
        borderRadius: 28,
        background: "linear-gradient(180deg, rgba(62,207,142,0.10), rgba(28,28,30,0.92) 30%)",
        border: "1.5px solid rgba(62,207,142,0.45)",
        padding: 26,
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Logo name="supabase" size={40} />
        <span style={{ fontFamily: FONT.sans, fontWeight: 700, fontSize: 36, color: C.text }}>Supabase</span>
        <span style={{ flex: 1 }} />
        <Logo name="postgresql" size={34} />
        <Mono size={24} color={C.text2}>
          Postgres 17
        </Mono>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {CHIPS.map((c, i) => (
          <ChipCell key={c.title} delay={44 + i * 6} title={c.title} sub={c.sub} />
        ))}
      </div>
    </div>
  );
};

const ChipCell: React.FC<{ delay: number; title: string; sub: string }> = ({ delay, title, sub }) => {
  const p = useIn(delay, 14);
  return (
    <div
      style={{
        opacity: p,
        borderRadius: 16,
        background: "rgba(255,255,255,0.05)",
        border: `1px solid ${C.hairline}`,
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        height: 104,
        justifyContent: "center",
      }}
    >
      <span style={{ fontFamily: FONT.mono, fontWeight: 500, fontSize: 22, color: C.text, whiteSpace: "nowrap" }}>{title}</span>
      <span style={{ fontFamily: FONT.sans, fontSize: 21, color: C.text2, whiteSpace: "nowrap" }}>{sub}</span>
    </div>
  );
};

export const S13Architecture: React.FC = () => {
  return (
    <AbsoluteFill>
      <Backdrop variant="glow" intensity={0.7} />
      <AbsoluteFill>
        <div style={{ position: "absolute", left: 120, top: 96, display: "flex", flexDirection: "column", gap: 14 }}>
          <Reveal>
            <Eyebrow>Архитектура</Eyebrow>
          </Reveal>
          <Reveal delay={4}>
            <Headline size={64}>Один источник правды: Postgres</Headline>
          </Reveal>
        </div>
        <Edges />
        {CLIENTS.map((n) => (
          <Node key={n.title} n={n} />
        ))}
        <Supabase />
        {RIGHT.map((n) => (
          <Node key={n.title} n={n} />
        ))}
        <div style={{ position: "absolute", left: 120, right: 120, top: 892, display: "flex", flexDirection: "column", gap: 10 }}>
          <Reveal delay={130}>
            <Mono size={24} color={C.text2} weight={400}>
              Для комбината: Supabase с открытым кодом на своих серверах или в облаке РК, закон 94-V
            </Mono>
          </Reveal>
          <Reveal delay={140}>
            <Mono size={24} color={C.text2} weight={400}>
              Статусы только по часам сервера · каждое действие идемпотентно · RLS по ролям
            </Mono>
          </Reveal>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
