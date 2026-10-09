// Renders single frames of the film for review (a contact sheet), with one bundle and one browser.
//   node scripts/stills.mjs <out-dir> [seconds ...] [--scale=0.5]
// Without seconds it takes two frames per scene: just after the entrance and just before the exit.
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromeExecutable } from "./chrome.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const args = process.argv.slice(2);
const outDir = resolve(args.find((a) => !a.startsWith("--") && Number.isNaN(Number(a))) ?? join(root, "out/stills"));
const scale = Number((args.find((a) => a.startsWith("--scale=")) ?? "--scale=0.5").split("=")[1]);
const seconds = args.filter((a) => !a.startsWith("--") && !Number.isNaN(Number(a))).map(Number);

mkdirSync(outDir, { recursive: true });
const serveUrl = await bundle({ entryPoint: join(root, "src/index.ts"), rspack: true });
const browserExecutable = chromeExecutable();
const composition = await selectComposition({ serveUrl, id: "RotaDemo", browserExecutable });

let frames = seconds.map((s) => Math.round(s * composition.fps));
if (frames.length === 0) {
  const { SCENES, TRANSITION } = await import("../src/data/scenes.ts").catch(() => ({}));
  if (SCENES) {
    let t = 0;
    for (const s of SCENES) {
      frames.push(t + TRANSITION + 30, t + s.frames - TRANSITION - 6);
      t += s.frames - TRANSITION;
    }
  } else {
    frames = Array.from({ length: 12 }, (_, i) => Math.round(((i + 0.5) / 12) * composition.durationInFrames));
  }
}

for (const frame of frames) {
  const sec = (frame / composition.fps).toFixed(1).padStart(5, "0");
  const output = join(outDir, `t${sec}s-f${String(frame).padStart(4, "0")}.png`);
  await renderStill({ serveUrl, composition, frame, output, scale, browserExecutable, imageFormat: "png" });
  console.log(output);
}
