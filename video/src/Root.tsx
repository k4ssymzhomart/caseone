import React from "react";
import { AbsoluteFill, Composition, Folder, Still } from "remotion";
import { Film, SCENE_COMPONENTS } from "./Film";
import { FILM_FRAMES, FPS, HEIGHT, SCENES, WIDTH } from "./data/scenes";
import { fontsReady } from "./fonts";
import { Thumbnail } from "./Thumbnail";

// Fonts load once for every composition (loadFont holds the render until they are ready).
void fontsReady;

/** The same film laid out at 1920 × 1080 and scaled to 1280 × 720 for quick drafts (`--scale` cannot hit 720 exactly). */
const Draft: React.FC<{ frames: number }> = ({ frames }) => (
  <AbsoluteFill style={{ background: "#000" }}>
    <div style={{ position: "absolute", left: 0, top: 0, width: WIDTH, height: HEIGHT, scale: String(1280 / WIDTH), transformOrigin: "0 0" }}>
      <Film frames={frames} />
    </div>
  </AbsoluteFill>
);

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="RotaDemo"
      component={Film}
      durationInFrames={FILM_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={{ frames: FILM_FRAMES }}
    />
    <Composition
      id="RotaDemoDraft"
      component={Draft}
      durationInFrames={FILM_FRAMES}
      fps={FPS}
      width={1280}
      height={720}
      defaultProps={{ frames: FILM_FRAMES }}
    />
    <Still id="RotaThumbnail" component={Thumbnail} width={1280} height={720} />
    <Folder name="Scenes">
      {SCENES.map((s) => (
        <Composition
          key={s.id}
          id={s.id}
          component={SCENE_COMPONENTS[s.id]}
          durationInFrames={s.frames}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
        />
      ))}
    </Folder>
  </>
);
