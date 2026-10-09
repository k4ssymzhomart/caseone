// A browser window for the web panel. Plays public/footage/<scene>-web.mp4 when recorded, otherwise scrolls through
// the 1440 px wide stills from docs/screenshots/presentation/web-live.
import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { footageFor } from "../data/footage";
import { STILLS, type StillName } from "../data/stills";
import { C, FONT, ease } from "../theme";
import { Logo } from "./brand";
import { FootagePlayer } from "./Footage";

export type WebShot = {
  still: StillName;
  at: number;
  /** Scroll keyframes: [frame within the scene, top of the viewport as a fraction of the page height]. */
  scroll?: Array<[number, number]>;
};

/** A rectangle on the page, in page fractions, drawn while the page scrolls under it. */
export type PageMark = { at: number; until?: number; still: StillName; x: number; y: number; w: number; h: number };

const BAR = 52;

/** The window of the web scenes: a 16:9 page (the recordings are 1920 × 1080) under the address bar, beside a
 * 446 px caption column (446 + 50 + 1184 = 1920 minus the safe margins). */
export const WEB_W = 1184;
export const WEB_H = (WEB_W * 9) / 16 + BAR;

const WebLayer: React.FC<{ shot: WebShot; next?: WebShot; width: number; viewport: number; marks: PageMark[] }> = ({
  shot,
  next,
  width,
  viewport,
  marks,
}) => {
  const frame = useCurrentFrame();
  if (frame < shot.at) return null;
  if (next && frame > next.at + 12) return null;
  const [w, h] = STILLS[shot.still];
  const pageHeight = (h / w) * width;
  const keys = shot.scroll ?? [[shot.at, 0]];
  const top =
    keys.length === 1
      ? keys[0][1]
      : interpolate(
          frame,
          keys.map((k) => k[0]),
          keys.map((k) => k[1]),
          { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(...ease.inOut) },
        );
  const maxScroll = Math.max(0, pageHeight - viewport);
  const y = -Math.min(maxScroll, top * pageHeight);
  const fade = shot.at === 0 ? 1 : interpolate(frame, [shot.at, shot.at + 10], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ opacity: fade }}>
      <div style={{ position: "absolute", left: 0, top: y, width, height: pageHeight }}>
        <Img src={staticFile(`stills/${shot.still}`)} style={{ width, height: pageHeight, display: "block" }} />
        {marks
          .filter((m) => m.still === shot.still)
          .map((m) => {
            const p = interpolate(frame, [m.at, m.at + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            const out = m.until ? interpolate(frame, [m.until, m.until + 10], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
            return (
              <div
                key={`${m.at}-${m.y}`}
                style={{
                  position: "absolute",
                  left: m.x * width,
                  top: m.y * pageHeight,
                  width: m.w * width,
                  height: m.h * pageHeight,
                  borderRadius: 12,
                  border: `3px solid ${C.red}`,
                  boxShadow: `0 0 0 6px rgba(255,59,48,0.18), 0 0 40px rgba(255,59,48,0.35)`,
                  opacity: p * out,
                  scale: String(interpolate(p, [0, 1], [1.04, 1])),
                }}
              />
            );
          })}
      </div>
    </AbsoluteFill>
  );
};

export const Browser: React.FC<{
  slot: string;
  url: string;
  width: number;
  height: number;
  shots: WebShot[];
  marks?: PageMark[];
  /** Drawn over the page in both modes (overlays that explain, not fake UI). */
  overlay?: React.ReactNode;
  /** Drawn over the page only when there is no recording. */
  stillOverlay?: React.ReactNode;
}> = ({ slot, url, width, height, shots, marks = [], overlay, stillOverlay }) => {
  const footage = footageFor(slot);
  const viewport = height - BAR;
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 22,
        overflow: "hidden",
        background: "#0b0b0c",
        border: `1px solid ${C.hairlineStrong}`,
        boxShadow: "0 60px 140px rgba(0,0,0,0.8), 0 0 0 1px rgba(0,0,0,0.6)",
        position: "relative",
      }}
    >
      <div
        style={{
          height: BAR,
          display: "flex",
          alignItems: "center",
          gap: 18,
          padding: "0 20px",
          background: "#1c1c1e",
          borderBottom: `1px solid ${C.hairline}`,
        }}
      >
        <div style={{ display: "flex", gap: 9 }}>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <span key={c} style={{ width: 13, height: 13, borderRadius: 99, background: c }} />
          ))}
        </div>
        <div
          style={{
            flex: 1,
            maxWidth: 620,
            margin: "0 auto",
            height: 32,
            borderRadius: 10,
            background: "rgba(255,255,255,0.07)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            fontFamily: FONT.sans,
            fontSize: 17,
            color: C.text2,
          }}
        >
          <Logo name="chrome" size={16} />
          <span>{url}</span>
        </div>
        <div style={{ width: 66 }} />
      </div>
      <div style={{ position: "relative", height: viewport, overflow: "hidden" }}>
        {footage ? (
          <FootagePlayer footage={footage} />
        ) : (
          <>
            {shots.map((shot, i) => (
              <WebLayer key={`${shot.still}-${shot.at}`} shot={shot} next={shots[i + 1]} width={width} viewport={viewport} marks={marks} />
            ))}
            {stillOverlay}
          </>
        )}
        {overlay}
      </div>
    </div>
  );
};
