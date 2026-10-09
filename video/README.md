# Rota demo film

A Remotion 4 project for the Demo Day film: 2:58, 1920 × 1080, 30 fps, Russian captions. It is a standalone npm project
(not a workspace of the monorepo) that reads the brand from `packages/design` and the screens from
`docs/screenshots/presentation`.

- [STORYBOARD.md](STORYBOARD.md): every scene with timing, footage, captions, motion, and the sources of every number
- [RECORDING.md](RECORDING.md): how to record the real phones and the web panel and drop the takes in

```sh
cd video
npm install
npm run dev            # Remotion Studio: «RotaDemo», the 720p draft and each scene under «Scenes»
npm run render:draft   # out/rota-demo-draft.mp4, 1280 × 720
npm run render         # out/rota-demo.mp4, 1920 × 1080
npm run thumbnail      # ../docs/readme/youtube-thumb.jpg, 1280 × 720, the YouTube thumbnail (src/Thumbnail.tsx)
npm run stills -- out/stills 12 45 90   # review frames at those seconds (two per scene without arguments)
npm run lint           # eslint + tsc
```

`npm run sync` (run by the scripts above) copies the logo, mascots, wallpaper, fonts and stills into `public/` (git
ignored). Recordings go to `public/footage/` under the names in its README; a scene uses its recording when the file is
there and the stills otherwise. `src/data/footage.ts` says which stretches of each clip play, how fast, and where the web
camera zooms; scenes sync their captions to clip seconds through `at(slot, seconds)`. Take specific values (order numbers, score, confidence) live in `src/data/take.ts`;
measured numbers with their sources in `src/data/numbers.ts`.

| Path | What |
| --- | --- |
| `src/Film.tsx` | the running order with cross fades, the corner lockup and the chapter bar |
| `src/scenes/` | one file per scene, `S01ColdOpen` to `S15Outro` (with `S12Dashboard` and `S13Privacy`) |
| `src/components/` | `Phone` (frame, footage or stills, tap ripples, HUD toasts), `Browser`, `Footage` (cuts, speed, hold, zoom), `Backdrop`, `CountUp` and `Stopwatch`, brand marks and platform logos, text and glass |
| `src/data/` | scene timing, stills sizes, footage slots, numbers, the take |
| `scripts/` | asset sync, review stills, the web recorder, the Chrome lookup |

Rendering uses the installed Google Chrome (see `scripts/chrome.mjs`): on this Mac the downloaded headless shell never
fires `requestAnimationFrame` and the render hangs.
