// Real screen recordings live in public/footage (see RECORDING.md). A scene plays its recording when the file is
// there and falls back to the stills otherwise, so the film always renders.
// File names: <scene>.mp4 for a scene with one screen, <scene>-A.mp4 / -B.mp4 / -C.mp4 for side by side scenes
// (A master 1001, B worker 2001, C worker 2002), <scene>-web.mp4 for the web panel.
// getStaticFiles from "remotion" (not @remotion/studio: importing the studio package into the bundle stops the
// render from loading the root component).
import { getStaticFiles, staticFile } from "remotion";

export type FootageSpec = {
  /** File under public/footage. */
  file: string;
  /** Seconds cut from the start of the recording, so the take lines up with the scene. */
  trimBefore?: number;
  /** 1 plays the take at real speed; above 1 speeds up a slow take (status changes stay honest). */
  playbackRate?: number;
};

// Trims are tuned after each recording session: play the take in the Studio and set where the action starts.
export const FOOTAGE: Record<string, FootageSpec> = {
  "s01-cold-open-B": { file: "s01-cold-open-B.mp4", trimBefore: 0 },
  "s03-issue-A": { file: "s03-issue.mp4", trimBefore: 0 },
  "s04-accept-A": { file: "s04-accept-A.mp4", trimBefore: 0 },
  "s04-accept-B": { file: "s04-accept-B.mp4", trimBefore: 0 },
  "s05-deadline-A": { file: "s05-deadline-A.mp4", trimBefore: 0 },
  "s05-deadline-B": { file: "s05-deadline-B.mp4", trimBefore: 0 },
  "s06-close-B": { file: "s06-close.mp4", trimBefore: 0 },
  "s07-check-B": { file: "s07-check.mp4", trimBefore: 0 },
  "s08-verdict-A": { file: "s08-verdict-A.mp4", trimBefore: 0 },
  "s08-verdict-B": { file: "s08-verdict-B.mp4", trimBefore: 0 },
  "s09-rework-C": { file: "s09-rework-C.mp4", trimBefore: 0 },
  "s09-rework-A": { file: "s09-rework-A.mp4", trimBefore: 0 },
  "s10-shift-report-web": { file: "s10-shift-report-web.mp4", trimBefore: 0 },
  "s11-rating-web": { file: "s11-rating-web.mp4", trimBefore: 0 },
  "s12-analytics-web": { file: "s12-analytics-web.mp4", trimBefore: 0 },
};

let cache: Set<string> | null = null;

const present = (): Set<string> => {
  if (!cache) {
    cache = new Set(getStaticFiles().map((f) => f.name));
  }
  return cache;
};

/** The recording for a slot, or null when public/footage has no such file yet. */
export const footageFor = (slot: string): (FootageSpec & { src: string }) | null => {
  const spec = FOOTAGE[slot];
  if (!spec) return null;
  const name = `footage/${spec.file}`;
  return present().has(name) ? { ...spec, src: staticFile(name) } : null;
};
