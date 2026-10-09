// Real screen recordings live in public/footage (see RECORDING.md). A scene plays its recording when the file is
// there and falls back to the stills otherwise, so the film always renders.
// File names: <scene>.mp4 for a scene with one screen, <scene>-A.mp4 / -B.mp4 / -C.mp4 for side by side scenes
// (A master 1001, B worker 2001, C worker 2002), <scene>-web.mp4 for the web panel.
// getStaticFiles from "remotion" (not @remotion/studio: importing the studio package into the bundle stops the
// render from loading the root component).
import { getStaticFiles, staticFile } from "remotion";

/** A stretch of the recording, in seconds of the file, played at `rate` (1 is real speed). */
export type Segment = { from: number; to: number; rate?: number };

/** Where the web panel camera looks at clip time `t`: `scale` 1 shows the whole page, `x` and `y` are the point of the
 * page (fractions of the frame) kept at the centre of the window. Zoomed keys keep the left edge of the view right of
 * the panel's sidebar (x ≥ 0,172 + 0,5 / scale), so no sliver of it shows at the edge. */
export type ZoomKey = { t: number; scale: number; x: number; y: number };

export type FootageSpec = {
  /** File under public/footage. */
  file: string;
  /** Length of the file in seconds (ffprobe), so a scene never asks for a frame past the end. */
  duration: number;
  /** The stretches the scene plays, one after another. Without it: the whole file from `trimBefore`. After the last
   * stretch the scene holds its last frame. */
  segments?: Segment[];
  /** Seconds cut from the start of the recording. */
  trimBefore?: number;
  /** 1 plays the take at real speed; above 1 speeds up a slow take (status changes stay honest). */
  playbackRate?: number;
  zoom?: ZoomKey[];
};

// Cut points come from the recordings themselves: the frame where each tap shows (see the scene files, which name the
// clip times they sync to) and docs/live-loop-timings.md for the phone takes.
export const FOOTAGE: Record<string, FootageSpec> = {
  "s01-cold-open-B": { file: "s01-cold-open-B.mp4", duration: 8 },
  // 1.2 s of the shift screen before the first tap; «Выдан за 6 нажатий · 0:15» lands at 16.7 s of the scene.
  "s03-issue-A": { file: "s03-issue.mp4", duration: 19.267, trimBefore: 1.2 },
  "s04-accept-A": { file: "s04-accept-A.mp4", duration: 15.4 },
  "s04-accept-B": { file: "s04-accept-B.mp4", duration: 15.4 },
  "s05-deadline-A": { file: "s05-deadline-A.mp4", duration: 14 },
  "s05-deadline-B": { file: "s05-deadline-B.mp4", duration: 14 },
  "s06-close-B": { file: "s06-close.mp4", duration: 8.6 },
  "s07-check-B": { file: "s07-check.mp4", duration: 10 },
  // From 0.9 s: B already shows the verdict that ends scene 7, A has opened the report.
  "s08-verdict-A": { file: "s08-verdict-A.mp4", duration: 11.5, trimBefore: 0.9 },
  "s08-verdict-B": { file: "s08-verdict-B.mp4", duration: 11.5, trimBefore: 0.9 },
  "s09-rework-C": { file: "s09-rework-C.mp4", duration: 12.5, trimBefore: 0.2 },
  // Recorded after C's verdict: the scene starts it once C shows «Требует доработки».
  "s09-rework-A": { file: "s09-rework-A.mp4", duration: 10.6, trimBefore: 2.4, playbackRate: 1.4 },
  "s10-shift-report-web": {
    file: "s10-shift-report-web.mp4",
    duration: 17.9,
    segments: [
      { from: 0, to: 2.4 },
      { from: 2.4, to: 8.3, rate: 1.25 },
      { from: 8.3, to: 12.6, rate: 1.6 },
    ],
    zoom: [
      { t: 0, scale: 1.22, x: 0.587, y: 0.4 },
      { t: 2.3, scale: 1.22, x: 0.587, y: 0.4 },
      { t: 3.9, scale: 1.55, x: 0.5, y: 0.49 },
      { t: 8.0, scale: 1.55, x: 0.5, y: 0.49 },
      { t: 9.2, scale: 1.22, x: 0.587, y: 0.42 },
      { t: 12.6, scale: 1.22, x: 0.587, y: 0.42 },
    ],
  },
  "s11-rating-web": {
    file: "s11-rating-web.mp4",
    duration: 14.6,
    segments: [
      { from: 0, to: 6, rate: 1.25 },
      { from: 6, to: 14.6, rate: 1.75 },
    ],
    zoom: [
      { t: 0, scale: 1.22, x: 0.587, y: 0.55 },
      { t: 2.6, scale: 1.22, x: 0.587, y: 0.55 },
      { t: 3.7, scale: 1.45, x: 0.53, y: 0.72 },
      { t: 5.7, scale: 1.45, x: 0.53, y: 0.72 },
      { t: 7.2, scale: 1.22, x: 0.587, y: 0.5 },
      { t: 10.2, scale: 1.26, x: 0.58, y: 0.62 },
      { t: 14.6, scale: 1.26, x: 0.58, y: 0.62 },
    ],
  },
  "s12-dashboard-web": {
    file: "s12-dashboard-web.mp4",
    duration: 12.8,
    segments: [{ from: 0.4, to: 12.8, rate: 2 }],
    zoom: [
      { t: 0.4, scale: 1.22, x: 0.587, y: 0.38 },
      { t: 6.5, scale: 1.22, x: 0.587, y: 0.38 },
      { t: 8.5, scale: 1.25, x: 0.58, y: 0.75 },
      { t: 12.8, scale: 1.25, x: 0.58, y: 0.75 },
    ],
  },
  "s12-analytics-web": {
    file: "s12-analytics-web.mp4",
    duration: 23.333,
    segments: [
      { from: 2.6, to: 8.8, rate: 2 },
      { from: 8.8, to: 16.6, rate: 1.6 },
      { from: 16.6, to: 21.2, rate: 1.4 },
    ],
    zoom: [
      { t: 2.6, scale: 1.22, x: 0.587, y: 0.36 },
      { t: 8.7, scale: 1.22, x: 0.587, y: 0.36 },
      { t: 9.5, scale: 1.45, x: 0.52, y: 0.62 },
      { t: 10.4, scale: 1.45, x: 0.52, y: 0.62 },
      { t: 12.0, scale: 1.6, x: 0.49, y: 0.46 },
      { t: 15.8, scale: 1.6, x: 0.49, y: 0.46 },
      { t: 17.6, scale: 1.35, x: 0.55, y: 0.62 },
      { t: 21.2, scale: 1.35, x: 0.55, y: 0.62 },
    ],
  },
  "s13-privacy-web": {
    file: "s13-privacy-web.mp4",
    duration: 13.7,
    segments: [{ from: 0, to: 13.7, rate: 1.45 }],
    zoom: [
      { t: 0, scale: 1.25, x: 0.59, y: 0.36 },
      { t: 2.4, scale: 1.25, x: 0.59, y: 0.36 },
      { t: 3.8, scale: 1, x: 0.5, y: 0.5 },
      { t: 8.6, scale: 1, x: 0.5, y: 0.5 },
      { t: 10.0, scale: 2.2, x: 0.77, y: 0.55 },
      { t: 13.7, scale: 2.2, x: 0.77, y: 0.55 },
    ],
  },
};

export type ResolvedFootage = FootageSpec & { src: string };

export const segmentsOf = (spec: FootageSpec): Required<Segment>[] =>
  (spec.segments ?? [{ from: spec.trimBefore ?? 0, to: spec.duration, rate: spec.playbackRate ?? 1 }]).map((s) => ({
    from: s.from,
    to: Math.min(s.to, spec.duration),
    rate: s.rate ?? 1,
  }));

/** Scene frames the segments fill (after that the scene holds the last frame). */
export const playFrames = (spec: FootageSpec, fps: number): number =>
  segmentsOf(spec).reduce((sum, s) => sum + ((s.to - s.from) * fps) / s.rate, 0);

/** Seconds into the file shown at `frame` frames after the footage starts. */
export const clipTimeAt = (spec: FootageSpec, frame: number, fps: number): number => {
  const segs = segmentsOf(spec);
  let f = Math.max(0, frame);
  for (const s of segs) {
    const len = ((s.to - s.from) * fps) / s.rate;
    if (f < len) return s.from + (f * s.rate) / fps;
    f -= len;
  }
  return segs[segs.length - 1].to - 1 / fps;
};

/** The scene frame (from the footage start) where second `t` of the file shows, for captions that sync to the take. */
export const frameOfClip = (spec: FootageSpec, t: number, fps: number): number => {
  let start = 0;
  for (const s of segmentsOf(spec)) {
    if (t <= s.to) return Math.round(start + (Math.max(0, t - s.from) * fps) / s.rate);
    start += ((s.to - s.from) * fps) / s.rate;
  }
  return Math.round(start);
};

/** frameOfClip for a slot name; 30 fps. */
export const at = (slot: string, t: number): number => frameOfClip(FOOTAGE[slot], t, 30);

let cache: Set<string> | null = null;

const present = (): Set<string> => {
  if (!cache) {
    cache = new Set(getStaticFiles().map((f) => f.name));
  }
  return cache;
};

/** The recording for a slot, or null when public/footage has no such file yet. */
export const footageFor = (slot: string): ResolvedFootage | null => {
  const spec = FOOTAGE[slot];
  if (!spec) return null;
  const name = `footage/${spec.file}`;
  return present().has(name) ? { ...spec, src: staticFile(name) } : null;
};
