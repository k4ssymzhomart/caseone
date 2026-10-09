// The whole film: scenes in a TransitionSeries with short crossfades, plus the brand mark and the chapter bar.
import { Audio } from "@remotion/media";
import { fade } from "@remotion/transitions/fade";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import React from "react";
import { AbsoluteFill, getStaticFiles, interpolate, staticFile, useCurrentFrame } from "remotion";
import { RotaLockup } from "./components/brand";
import { SCENES, sceneStarts, TRANSITION, type SceneId } from "./data/scenes";
import { S01ColdOpen } from "./scenes/S01ColdOpen";
import { S02Problem } from "./scenes/S02Problem";
import { S03Issue } from "./scenes/S03Issue";
import { S04Accept } from "./scenes/S04Accept";
import { S05Deadline } from "./scenes/S05Deadline";
import { S06Close } from "./scenes/S06Close";
import { S07Check } from "./scenes/S07Check";
import { S08Verdict } from "./scenes/S08Verdict";
import { S09Rework } from "./scenes/S09Rework";
import { S10ShiftReport } from "./scenes/S10ShiftReport";
import { S11Rating } from "./scenes/S11Rating";
import { S12Analytics } from "./scenes/S12Analytics";
import { S13Architecture } from "./scenes/S13Architecture";
import { S14Numbers } from "./scenes/S14Numbers";
import { S15Outro } from "./scenes/S15Outro";
import { C, FONT } from "./theme";

export const SCENE_COMPONENTS: Record<SceneId, React.FC> = {
  "s01-cold-open": S01ColdOpen,
  "s02-problem": S02Problem,
  "s03-issue": S03Issue,
  "s04-accept": S04Accept,
  "s05-deadline": S05Deadline,
  "s06-close": S06Close,
  "s07-check": S07Check,
  "s08-verdict": S08Verdict,
  "s09-rework": S09Rework,
  "s10-shift-report": S10ShiftReport,
  "s11-rating": S11Rating,
  "s12-analytics": S12Analytics,
  "s13-architecture": S13Architecture,
  "s14-numbers": S14Numbers,
  "s15-outro": S15Outro,
};

const starts = sceneStarts();
const CHAPTERS = SCENES.filter((s) => s.chapter);
const firstChapter = starts[CHAPTERS[0].id];
const lastChapter = CHAPTERS[CHAPTERS.length - 1];
const chaptersEnd = starts[lastChapter.id] + lastChapter.frames;

/** The small lockup in the corner and the chapter bar, shown over the product scenes only. */
const Chrome: React.FC = () => {
  const frame = useCurrentFrame();
  const show = interpolate(frame, [firstChapter, firstChapter + 18, chaptersEnd - 18, chaptersEnd], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  if (show <= 0) return null;
  const current = [...CHAPTERS].reverse().find((s) => frame >= starts[s.id] + TRANSITION / 2) ?? CHAPTERS[0];
  return (
    <AbsoluteFill style={{ opacity: show, pointerEvents: "none" }}>
      <div style={{ position: "absolute", left: 120, top: 38 }}>
        <RotaLockup height={32} />
      </div>
      <div
        style={{
          position: "absolute",
          right: 120,
          top: 44,
          fontFamily: FONT.mono,
          fontSize: 18,
          letterSpacing: "0.12em",
          color: C.text3,
          textTransform: "uppercase",
        }}
      >
        Кейс 1 · НарядAI
      </div>
      <div style={{ position: "absolute", left: 120, right: 120, bottom: 34, display: "flex", gap: 10 }}>
        {CHAPTERS.map((s) => {
          const start = starts[s.id];
          const p = interpolate(frame, [start, start + s.frames - TRANSITION], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const active = s.id === current.id;
          return (
            <div key={s.id} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ height: 3, borderRadius: 99, background: "rgba(255,255,255,0.12)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${p * 100}%`, background: active ? C.red : "rgba(255,255,255,0.5)" }} />
              </div>
              <span
                style={{
                  fontFamily: FONT.mono,
                  fontSize: 16,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: active ? C.text : C.text3,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {s.chapter}
              </span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/** Optional score: drop a track at public/audio/music.mp3 and it plays under the film, fading at both ends. */
const Music: React.FC<{ frames: number }> = ({ frames }) => {
  const has = getStaticFiles().some((f) => f.name === "audio/music.mp3");
  if (!has) return null;
  return (
    <Audio
      src={staticFile("audio/music.mp3")}
      volume={(f) => interpolate(f, [0, 30, frames - 60, frames], [0, 0.6, 0.6, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
    />
  );
};

export const Film: React.FC<{ frames: number }> = ({ frames }) => (
  <AbsoluteFill style={{ background: C.canvas }}>
    <TransitionSeries>
      {SCENES.flatMap((s, i) => {
        const Scene = SCENE_COMPONENTS[s.id];
        const items = [
          <TransitionSeries.Sequence key={s.id} durationInFrames={s.frames} name={s.id}>
            <Scene />
          </TransitionSeries.Sequence>,
        ];
        if (i < SCENES.length - 1) {
          items.push(
            <TransitionSeries.Transition
              key={`${s.id}-t`}
              presentation={fade()}
              timing={linearTiming({ durationInFrames: TRANSITION })}
            />,
          );
        }
        return items;
      })}
    </TransitionSeries>
    <Chrome />
    <Music frames={frames} />
  </AbsoluteFill>
);
