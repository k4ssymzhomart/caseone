// The film's palette and type, taken from @rota/design (packages/design) so the video and the apps agree.
import { color, primitives } from "../../packages/design/src/generated/tokens";
import { statusColors } from "../../packages/design/src/extensions";

const dark = color.dark;
const status = statusColors.dark;

export const C = {
  canvas: dark["bg/canvas"], // #000000
  subtle: dark["bg/subtle"], // #161617
  muted: dark["bg/muted"], // #1c1c1e
  control: dark["bg/control"],
  text: dark["text/primary"],
  text2: dark["text/secondary"],
  text3: primitives["gray/600"],
  red: primitives["red/500"], // #FF3B30, the brand and the critical color
  red400: primitives["red/400"],
  red300: primitives["red/300"],
  red700: primitives["red/700"],
  red800: primitives["red/800"],
  red900: primitives["red/900"],
  free: status.free,
  working: status.working,
  queue: status.queue,
  off: status.off,
  warning: status.warning,
  hairline: "rgba(255,255,255,0.08)",
  hairlineStrong: "rgba(255,255,255,0.14)",
  glass: "rgba(28,28,30,0.72)",
  glassStrong: "rgba(28,28,30,0.9)",
} as const;

export const FONT = {
  sans: "Inter, system-ui, sans-serif",
  mono: "'Geist Mono', ui-monospace, monospace",
} as const;

// Text sizes for a 1920 × 1080 frame (video-layout rule: headline ≥ 84 at 1080 wide, scaled up for 1920).
export const T = {
  display: 132,
  headline: 92,
  title: 64,
  lead: 44,
  body: 36,
  label: 30,
  eyebrow: 24,
  small: 22,
} as const;

export const SAFE = { x: 120, y: 96 } as const;

export const ease = {
  out: [0.16, 1, 0.3, 1] as const,
  inOut: [0.65, 0, 0.35, 1] as const,
  snap: [0.34, 1.56, 0.64, 1] as const,
};
