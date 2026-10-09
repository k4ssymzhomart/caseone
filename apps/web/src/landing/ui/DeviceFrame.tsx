// A premium phone around a real app screen, for product shots on the landing. The device is drawn by us (inline
// SVG and CSS 3D, no Apple artwork, no logo): proportions of a 6.3 inch Pro, continuous corners, a lit metal band,
// an even black border, the island, buttons as slight protrusions, a glass sheen, an optional contact shadow.
// With a tilt the band becomes a real 3D edge (CSS preserve-3d walls) whose light follows the rotation.
//
//   <DeviceFrame src={deviceScreens.emergency} alt="…" width={340} tilt={{ y: -18 }} shadow="contact" priority />
//
// Width: a number (px) or any CSS length; a parent can override it with `--device-w` (e.g. in a media query).
import { useId, useMemo, type CSSProperties, type ReactNode } from 'react';
import type { DeviceScreen } from '../assets/deviceScreens';
import {
  BODY,
  buildModel,
  ISLAND,
  RIM,
  RIM_BAND_MASKS,
  SCREEN,
  squircle,
  type Finish,
  type Tilt,
} from './deviceModel';
import st from './DeviceFrame.module.css';

export type { Finish, Tilt } from './deviceModel';

export interface DeviceFrameProps {
  /** A screen from assets/deviceScreens.ts (srcset) or an image URL with the 1206 × 2622 aspect. */
  src: DeviceScreen | string;
  /** Russian description of the screen. */
  alt: string;
  /** Body width: px or a CSS length (default 320). `--device-w` on the element or a parent wins. */
  width?: number | string;
  /** `sizes` for the screen image; derived from a numeric width. */
  sizes?: string;
  /** Band finish: natural titanium (default) or black titanium. */
  finish?: Finish;
  /** A faint warm rim on the band from the red backdrop (default true). */
  rimLight?: boolean;
  /** 3D pose in degrees; any x or y rotation draws the band's side walls. */
  tilt?: Tilt;
  /** `float`: a deep soft shadow; `contact`: plus a tight shadow under the bottom edge; default `float`. */
  shadow?: 'none' | 'float' | 'contact';
  /** A slow 6 px drift (off under reduced motion). */
  float?: boolean;
  /** Above the fold: load the screen at once with high priority. */
  priority?: boolean;
  /** Content laid over the screen (a toast, a pointer). */
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

const pct = (v: number, of: number) => `${(v / of) * 100}%`;

/** The screen's continuous corners as a CSS mask, shared by every instance. */
const SCREEN_MASK = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SCREEN.w} ${SCREEN.h}" preserveAspectRatio="none"><path d="${squircle(0, 0, SCREEN.w, SCREEN.h, SCREEN.r)}"/></svg>`,
)}")`;
const GLASS_PATH = squircle(RIM, RIM, BODY.w - 2 * RIM, BODY.h - 2 * RIM, BODY.r - RIM);
const SCREEN_PATH = squircle(SCREEN.x, SCREEN.y, SCREEN.w, SCREEN.h, SCREEN.r);
const SCREEN_BOX: CSSProperties = {
  left: pct(SCREEN.x, BODY.w),
  top: pct(SCREEN.y, BODY.h),
  width: pct(SCREEN.w, BODY.w),
  height: pct(SCREEN.h, BODY.h),
};
const u = (n: number) => `calc(var(--u) * ${n})`;

export function DeviceFrame({
  src,
  alt,
  width = 320,
  sizes,
  finish = 'natural',
  rimLight = true,
  tilt,
  shadow = 'float',
  float = false,
  priority = false,
  children,
  className,
  style,
}: DeviceFrameProps) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const solid = Boolean(tilt && (Math.abs(tilt.x ?? 0) > 0.5 || Math.abs(tilt.y ?? 0) > 0.5));
  const tx = tilt?.x ?? 0;
  const ty = tilt?.y ?? 0;
  const tz = tilt?.z ?? 0;
  const persp = tilt?.perspective ?? 1600;
  // The viewer's distance in body units, so reflections match the browser's projection (a guess for CSS widths).
  const eye = (persp * BODY.w) / (typeof width === 'number' ? width : 360);
  const model = useMemo(
    () => buildModel(finish, rimLight, { x: tx, y: ty, z: tz }, solid, solid ? eye : undefined),
    [finish, rimLight, tx, ty, tz, solid, eye],
  );

  const img = typeof src === 'string' ? { src, srcSet: undefined } : src;
  const imgSizes =
    sizes ?? (typeof width === 'number' ? `${Math.ceil((width * SCREEN.w) / BODY.w)}px` : '360px');
  const vars = {
    '--dw': typeof width === 'number' ? `${width}px` : width,
    '--persp': `${persp}px`,
    ...style,
  } as CSSProperties;
  const pose = solid
    ? `rotateX(${tx}deg) rotateY(${ty}deg) rotateZ(${tz}deg)`
    : tz
      ? `rotate(${tz}deg)`
      : undefined;
  const s = model.sheenShift;

  return (
    <figure
      className={[st.device, className].filter(Boolean).join(' ')}
      style={vars}
      data-finish={finish}
      data-solid={solid || undefined}
      data-float={float || undefined}
    >
      {shadow === 'contact' && <div className={st.contact} aria-hidden="true" />}
      <div className={st.body} style={{ transform: pose }}>
        {shadow !== 'none' && <div className={st.drop} aria-hidden="true" />}

        {model.walls.map((w, i) => (
          <i
            key={`w${i}`}
            className={st.wall}
            aria-hidden="true"
            style={{
              width: u(w.len),
              height: u(w.depth),
              transform: `translate3d(${u(w.x)}, ${u(w.y)}, ${u(w.z)}) rotate(${w.angle}deg) rotateX(-90deg)`,
              background: w.background,
              borderRadius: w.radius ? u(w.radius) : undefined,
              boxShadow: w.ring ? `inset 0 0 0 ${u(4)} ${w.ring}` : undefined,
            }}
          />
        ))}
        {model.caps.map((c, i) => (
          <i
            key={`c${i}`}
            className={st.wall}
            aria-hidden="true"
            style={{
              width: u(c.len),
              height: u(c.depth),
              transform: `translate3d(${u(c.x)}, ${u(c.y)}, ${u(c.z)})`,
              background: c.background,
              borderRadius: c.radius ? u(c.radius) : undefined,
            }}
          />
        ))}

        <div className={st.face}>
          {!solid && (
            <svg className={st.svg} viewBox={`0 0 ${BODY.w} ${BODY.h}`} aria-hidden="true">
              <defs>
                {model.keys.map((k, i) => (
                  <linearGradient
                    key={i}
                    id={`${id}k${i}`}
                    gradientUnits="userSpaceOnUse"
                    x1={k.x1}
                    y1={0}
                    x2={k.x2}
                    y2={0}
                  >
                    {k.stops.map((p, j) => (
                      <stop key={j} offset={p.o} stopColor={p.c} />
                    ))}
                  </linearGradient>
                ))}
              </defs>
              {model.keys.map((k, i) => (
                <rect
                  key={i}
                  x={k.x}
                  y={k.y}
                  width={k.w}
                  height={k.h}
                  rx={Math.min(k.w / 2, 7)}
                  fill={`url(#${id}k${i})`}
                />
              ))}
            </svg>
          )}

          {model.rim.map((background, i) => (
            <i
              key={i}
              className={st.band}
              aria-hidden="true"
              style={{
                background,
                maskImage: RIM_BAND_MASKS[i],
                WebkitMaskImage: RIM_BAND_MASKS[i],
              }}
            />
          ))}

          <svg className={st.svg} viewBox={`0 0 ${BODY.w} ${BODY.h}`} aria-hidden="true">
            <defs>
              <linearGradient id={`${id}bezel`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#111113" />
                <stop offset="0.45" stopColor="#060607" />
                <stop offset="1" stopColor="#020202" />
              </linearGradient>
            </defs>
            <path d={GLASS_PATH} fill={`url(#${id}bezel)`} />
            <path d={SCREEN_PATH} fill="#000" />
          </svg>

          <img
            className={st.screen}
            style={{ ...SCREEN_BOX, maskImage: SCREEN_MASK, WebkitMaskImage: SCREEN_MASK }}
            src={img.src}
            srcSet={img.srcSet}
            sizes={img.srcSet ? imgSizes : undefined}
            width={SCREEN.w}
            height={SCREEN.h}
            alt={alt}
            loading={priority ? 'eager' : 'lazy'}
            decoding={priority ? 'sync' : 'async'}
            draggable={false}
            {...(priority ? { fetchPriority: 'high' as const } : {})}
          />

          <svg className={st.svg} viewBox={`0 0 ${BODY.w} ${BODY.h}`} aria-hidden="true">
            <defs>
              <linearGradient
                id={`${id}sheen`}
                gradientUnits="userSpaceOnUse"
                x1="0"
                y1="0"
                x2={BODY.w}
                y2="1900"
              >
                <stop offset={0.2 + s} stopColor="#fff" stopOpacity="0" />
                <stop offset={0.33 + s} stopColor="#fff" stopOpacity="0.075" />
                <stop offset={0.39 + s} stopColor="#fff" stopOpacity="0.032" />
                <stop offset={0.5 + s} stopColor="#fff" stopOpacity="0" />
                <stop offset={0.68 + s} stopColor="#fff" stopOpacity="0" />
                <stop offset={0.74 + s} stopColor="#fff" stopOpacity="0.028" />
                <stop offset={0.82 + s} stopColor="#fff" stopOpacity="0" />
              </linearGradient>
              <linearGradient id={`${id}edge`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#fff" stopOpacity="0.34" />
                <stop offset="0.3" stopColor="#fff" stopOpacity="0.06" />
                <stop offset="0.7" stopColor="#fff" stopOpacity="0.02" />
                <stop offset="1" stopColor="#fff" stopOpacity="0.14" />
              </linearGradient>
              <radialGradient id={`${id}lens`} cx="0.42" cy="0.4" r="0.6">
                <stop offset="0" stopColor="#1d2236" />
                <stop offset="0.55" stopColor="#0a0b12" />
                <stop offset="1" stopColor="#030304" />
              </radialGradient>
              <clipPath id={`${id}glass`}>
                <path d={GLASS_PATH} />
              </clipPath>
            </defs>
            <rect
              x={ISLAND.x}
              y={ISLAND.y}
              width={ISLAND.w}
              height={ISLAND.h}
              rx={ISLAND.h / 2}
              fill="#000"
              stroke="rgb(255 255 255 / 0.07)"
              strokeWidth="1.5"
            />
            <circle
              cx={ISLAND.x + ISLAND.w - ISLAND.h / 2}
              cy={ISLAND.y + ISLAND.h / 2}
              r="25"
              fill={`url(#${id}lens)`}
              stroke="rgb(46 52 72 / 0.55)"
              strokeWidth="2"
            />
            <circle
              cx={ISLAND.x + ISLAND.w - ISLAND.h / 2 - 8}
              cy={ISLAND.y + ISLAND.h / 2 - 8}
              r="5"
              fill="rgb(140 160 255 / 0.28)"
            />
            <g clipPath={`url(#${id}glass)`}>
              <rect width={BODY.w} height={BODY.h} fill={`url(#${id}sheen)`} />
            </g>
            <path d={GLASS_PATH} fill="none" stroke={`url(#${id}edge)`} strokeWidth="2.5" />
          </svg>

          {children != null && (
            <div className={st.content} style={SCREEN_BOX}>
              {children}
            </div>
          )}
        </div>
      </div>
    </figure>
  );
}
