// Plays a recording by its segments: every frame of the scene is mapped to one frame of the file (cuts, speed ups and
// the hold at the end come from src/data/footage.ts), then shown through Freeze so the render always gets the exact
// frame. Web clips also get the camera moves of their `zoom` keys.
import { Video } from "@remotion/media";
import React from "react";
import { AbsoluteFill, Easing, Freeze, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { clipTimeAt, frameOfClip, type ResolvedFootage } from "../data/footage";
import { ease } from "../theme";

const camera = (footage: ResolvedFootage, frame: number, fps: number): string | undefined => {
  const keys = footage.zoom;
  if (!keys || keys.length === 0) return undefined;
  const frames = keys.map((k) => frameOfClip(footage, k.t, fps));
  // Keys must be strictly increasing for interpolate; equal frames (a key inside a skipped stretch) are nudged.
  for (let i = 1; i < frames.length; i++) frames[i] = Math.max(frames[i], frames[i - 1] + 1);
  const opts = { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(...ease.inOut) } as const;
  const s = keys.length === 1 ? keys[0].scale : interpolate(frame, frames, keys.map((k) => k.scale), opts);
  const x = keys.length === 1 ? keys[0].x : interpolate(frame, frames, keys.map((k) => k.x), opts);
  const y = keys.length === 1 ? keys[0].y : interpolate(frame, frames, keys.map((k) => k.y), opts);
  // Keep the focus point at the centre, but never show past the edge of the page.
  const tx = Math.min(0, Math.max(1 - s, 0.5 - x * s));
  const ty = Math.min(0, Math.max(1 - s, 0.5 - y * s));
  return `translate(${tx * 100}%, ${ty * 100}%) scale(${s})`;
};

export const FootagePlayer: React.FC<{
  footage: ResolvedFootage;
  /** Scene frame where playback starts; before it the first frame of the first segment shows. */
  startAt?: number;
  fit?: "cover" | "contain";
}> = ({ footage, startAt = 0, fit = "cover" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - startAt;
  const last = Math.floor(footage.duration * fps) - 1;
  const source = Math.min(last, Math.max(0, Math.round(clipTimeAt(footage, local, fps) * fps)));
  const transform = camera(footage, local, fps);
  return (
    <AbsoluteFill style={{ overflow: "hidden", background: "#000" }}>
      <AbsoluteFill style={{ transformOrigin: "0 0", transform }}>
        <Freeze frame={source}>
          <Video src={footage.src} muted objectFit={fit} style={{ width: "100%", height: "100%" }} />
        </Freeze>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
