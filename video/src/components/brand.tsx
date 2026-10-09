// Rota brand marks, mascots and the real platform logos, all from packages/design.
import React from "react";
import { Img, staticFile } from "remotion";
import { lockupSymbolPath, lockupWordmarkPath, markPath } from "../../../packages/design/src/brand/logo";
import { platformLogos, type PlatformLogoName } from "../../../packages/design/src/brand/platforms";
import { C, FONT } from "../theme";

/** The Rota lockup (mark + wordmark), 165 × 50 viewBox. */
export const RotaLockup: React.FC<{ height: number; markRotate?: number; wordOpacity?: number }> = ({
  height,
  markRotate = 0,
  wordOpacity = 1,
}) => (
  <svg height={height} viewBox="0 0 165 50" style={{ overflow: "visible", display: "block" }}>
    <g style={{ transformOrigin: "25px 25px", rotate: `${markRotate}deg` }}>
      <path fill={C.red} d={lockupSymbolPath} />
    </g>
    <path fill="#FFFFFF" fillRule="evenodd" clipRule="evenodd" d={lockupWordmarkPath} opacity={wordOpacity} />
  </svg>
);

/** The Rota mark alone, 100 × 100 viewBox. */
export const RotaMark: React.FC<{ size: number; color?: string; rotate?: number }> = ({
  size,
  color = C.red,
  rotate = 0,
}) => (
  <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: "block", overflow: "visible" }}>
    <g style={{ transformOrigin: "50px 50px", rotate: `${rotate}deg` }}>
      <path fill={color} d={markPath} />
    </g>
  </svg>
);

export type MascotName =
  | "carry" | "check" | "cheer" | "dizzy" | "download" | "flip" | "globe" | "juggle" | "key" | "mail" | "oops"
  | "peek" | "point" | "read" | "search" | "shh" | "shield" | "sleep" | "swap" | "tap" | "tired" | "typing"
  | "wave" | "wrench";

export const Mascot: React.FC<{ name: MascotName; size: number; style?: React.CSSProperties }> = ({
  name,
  size,
  style,
}) => <Img src={staticFile(`brand/mascots/${name}.svg`)} style={{ width: size, height: size, ...style }} />;

/** A real platform or service mark (Simple Icons paths kept in packages/design). */
export const Logo: React.FC<{ name: PlatformLogoName; size: number; color?: string }> = ({ name, size, color }) => {
  const logo = platformLogos[name];
  const fill = color ?? logo.onDark;
  const detail = "detail" in logo ? logo.detail : undefined;
  const label = "label" in logo ? logo.label : undefined;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={logo.title} style={{ display: "block" }}>
      {logo.paths.map((d) => (
        <path key={d.slice(0, 24)} d={d} fill={fill} />
      ))}
      {detail?.paths.map((d) => <path key={d.slice(0, 24)} d={d} fill={detail.color} />)}
      {label ? (
        <text
          x="12"
          y="15.6"
          textAnchor="middle"
          fontFamily={FONT.sans}
          fontWeight={800}
          fontSize="9.5"
          fill={label.color}
        >
          {label.text}
        </text>
      ) : null}
    </svg>
  );
};

/** Logo plus its name, for the places where a platform is named on screen. */
export const LogoChip: React.FC<{ name: PlatformLogoName; text?: string; size?: number; dim?: boolean }> = ({
  name,
  text,
  size = 30,
  dim = false,
}) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: size * 0.4,
      padding: `${size * 0.32}px ${size * 0.6}px ${size * 0.32}px ${size * 0.42}px`,
      borderRadius: 999,
      background: "rgba(255,255,255,0.06)",
      border: `1px solid ${C.hairline}`,
      opacity: dim ? 0.6 : 1,
    }}
  >
    <Logo name={name} size={size} />
    <span style={{ fontFamily: FONT.sans, fontWeight: 600, fontSize: size * 0.82, color: C.text, whiteSpace: "nowrap" }}>
      {text ?? platformLogos[name].title}
    </span>
  </div>
);
