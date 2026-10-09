// Records the web panel through the Chrome DevTools Protocol into a constant 30 fps MP4: by default it polls
// Page.captureScreenshot (works headed and headless); --screencast uses Page.startScreencast instead, which only sends
// frames when the compositor paints and on some Macs delivers a single frame in headless mode.
// A person drives the page in the Chrome window that opens; the script only records what is painted.
//
//   node scripts/record-web.mjs <url> <out.mp4> [--seconds=40] [--headless] [--scale=2] [--profile=.rec-profile]
//
// The viewport is fixed at 1440 × 900 CSS px (the panel's design width, the same as the stills) with a device scale of
// 2 by default, so the frames are 2880 × 1800 and stay sharp inside the film's browser frame. Stop with Ctrl+C or let
// --seconds run out; the frames are then encoded with Remotion's bundled ffmpeg (`npx remotion ffmpeg`).
// --profile keeps the Chrome profile between runs, so you sign in once and record the next takes already signed in.
//   node scripts/record-web.mjs <url> <out.mp4> [--screencast]
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromeExecutable } from "./chrome.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : fallback;
};
const [url, outArg] = args.filter((a) => !a.startsWith("--"));
if (!url || !outArg) {
  console.error("usage: node scripts/record-web.mjs <url> <out.mp4> [--seconds=40] [--headless] [--scale=2] [--profile=dir]");
  process.exit(1);
}
const out = resolve(outArg);
const seconds = Number(flag("seconds", "0"));
const scale = Number(flag("scale", "2"));
const headless = args.includes("--headless");
const screencast = args.includes("--screencast");
const WIDTH = 1440;
const HEIGHT = 900;
const PORT = 9333 + Math.floor(Math.random() * 500);

const chrome = chromeExecutable();
if (!chrome) throw new Error("No Chrome found. Set REMOTION_CHROME to a Chrome or Chromium binary.");

const keepProfile = flag("profile", "");
const profile = keepProfile ? resolve(keepProfile) : mkdtempSync(join(tmpdir(), "rota-rec-profile-"));
mkdirSync(profile, { recursive: true });
const frames = mkdtempSync(join(tmpdir(), "rota-rec-frames-"));
const browser = spawn(
  chrome,
  [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    `--window-size=${WIDTH},${HEIGHT + 120}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    // A recorder must never let Chrome throttle a page it thinks is hidden.
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    ...(headless ? ["--headless=new"] : []),
    "about:blank",
  ],
  { stdio: "ignore" },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target = null;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    target = list.find((t) => t.type === "page");
  } catch {
    // Chrome is still starting.
  }
}
if (!target) throw new Error("Chrome did not open a debuggable page.");

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => {
  ws.onopen = r;
  ws.onerror = j;
});
let nextId = 1;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((resolveCall) => {
    const id = nextId++;
    pending.set(id, resolveCall);
    ws.send(JSON.stringify({ id, method, params }));
  });

const shots = [];
ws.onmessage = (event) => {
  const msg = JSON.parse(String(event.data));
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result);
    pending.delete(msg.id);
    return;
  }
  if (msg.method === "Page.screencastFrame") {
    const { data, metadata, sessionId } = msg.params;
    const file = join(frames, `f${String(shots.length).padStart(6, "0")}.jpg`);
    writeFileSync(file, Buffer.from(data, "base64"));
    shots.push({ file, t: metadata.timestamp });
    ws.send(JSON.stringify({ id: nextId++, method: "Page.screencastFrameAck", params: { sessionId } }));
  }
};

await send("Page.enable");
// Keep the page painting as if it had focus, also in headless mode and behind other windows.
await send("Page.bringToFront");
await send("Emulation.setFocusEmulationEnabled", { enabled: true });
await send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: HEIGHT, deviceScaleFactor: scale, mobile: false });
await send("Page.navigate", { url });
await sleep(1500);
let recording = true;
if (screencast) {
  await send("Page.startScreencast", {
    format: "jpeg",
    quality: 92,
    maxWidth: WIDTH * scale,
    maxHeight: HEIGHT * scale,
    everyNthFrame: 1,
  });
} else {
  // One screenshot after another, each stamped with the time it was asked for.
  void (async () => {
    while (recording) {
      const t = Date.now() / 1000;
      const shot = await send("Page.captureScreenshot", { format: "jpeg", quality: 92, optimizeForSpeed: true });
      if (!recording || !shot) break;
      const file = join(frames, `f${String(shots.length).padStart(6, "0")}.jpg`);
      writeFileSync(file, Buffer.from(shot.data, "base64"));
      shots.push({ file, t });
    }
  })();
}
const started = Date.now();
console.log(`recording ${url} at ${WIDTH}×${HEIGHT} ×${scale} (${screencast ? "screencast" : "screenshots"}); Ctrl+C to stop${seconds ? ` (or ${seconds} s)` : ""}`);

const finish = async () => {
  recording = false;
  if (screencast) await send("Page.stopScreencast").catch(() => {});
  await sleep(200);
  ws.close();
  browser.kill();
  const end = (Date.now() - started) / 1000;
  if (shots.length === 0) throw new Error("No frames were painted.");
  // The screencast only sends a frame when the page repaints: hold each frame until the next one (concat demuxer).
  const t0 = shots[0].t;
  const lines = [];
  shots.forEach((s, i) => {
    const next = i + 1 < shots.length ? shots[i + 1].t : t0 + end;
    lines.push(`file '${s.file}'`, `duration ${Math.max(1 / 30, next - s.t).toFixed(4)}`);
  });
  lines.push(`file '${shots[shots.length - 1].file}'`);
  const list = join(frames, "list.txt");
  writeFileSync(list, `${lines.join("\n")}\n`);
  mkdirSync(dirname(out), { recursive: true });
  const ff = spawnSync(
    "npx",
    [
      "remotion",
      "ffmpeg",
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      list,
      // Remotion's ffmpeg ships few filters (no fps or format): the output rate and pixel format do the same job.
      "-vf",
      "scale=trunc(iw/2)*2:trunc(ih/2)*2",
      "-r",
      "30",
      "-pix_fmt",
      "yuv420p",
      "-c:v",
      "libx264",
      "-crf",
      "16",
      "-preset",
      "slow",
      "-an",
      out,
    ],
    { cwd: root, stdio: "inherit" },
  );
  rmSync(frames, { recursive: true, force: true });
  if (!keepProfile) rmSync(profile, { recursive: true, force: true });
  if (ff.status !== 0) throw new Error("ffmpeg failed");
  console.log(`${shots.length} painted frames, ${end.toFixed(1)} s → ${out}`);
  process.exit(0);
};

process.on("SIGINT", () => void finish());
if (seconds > 0) {
  setTimeout(() => void finish(), seconds * 1000);
}
