// Minimal CDP driver for the scripted web panel takes (README in this folder: director.mjs). No dependencies: Node's
// fetch and WebSocket, the installed Google Chrome, Remotion's ffmpeg. Signs in like tools/web-screens.ts: the
// publishable key from apps/web/.env.local and the test accounts of CLAUDE.md §23, session injected into localStorage.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const VIDEO = resolve(import.meta.dirname, "..", "..");

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const env = (file) =>
  Object.fromEntries(
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
  );
const WEB_ENV = env(resolve(VIDEO, "..", "apps/web/.env.local"));
export const SB_URL = WEB_ENV.VITE_SUPABASE_URL;
export const SB_KEY = WEB_ENV.VITE_SUPABASE_PUBLISHABLE_KEY;
export const STORAGE_KEY = `sb-${new URL(SB_URL).hostname.split(".")[0]}-auth-token`;

export async function session(tab, pin) {
  const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SB_KEY, "content-type": "application/json" },
    body: JSON.stringify({ email: `${tab}@naryad.local`, password: `nr_${pin}_kz` }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`sign in ${tab} failed: ${j.error_code ?? r.status}`);
  return { ...j, expires_at: Math.floor(Date.now() / 1000) + Number(j.expires_in ?? 3600) };
}

export async function launch({ width = 1920, height = 1080, scale = 1, headless = true } = {}) {
  const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const port = 9400 + Math.floor(Math.random() * 400);
  const profile = mkdtempSync(join(tmpdir(), "rota-film-profile-"));
  const proc = spawn(
    chrome,
    [
      ...(headless ? ["--headless=new"] : []),
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      `--window-size=${width},${height}`,
      "--hide-scrollbars",
      "--force-dark-mode",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "--font-render-hinting=none",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(200);
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      wsUrl = list.find((t) => t.type === "page")?.webSocketDebuggerUrl ?? null;
    } catch {}
  }
  if (!wsUrl) throw new Error("Chrome did not start");
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  let seq = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(String(ev.data));
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) rej(new Error(`${msg.error.message}`));
      else res(msg.result ?? {});
      return;
    }
    for (const l of listeners) l(msg);
  };
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const id = ++seq;
      pending.set(id, { res, rej });
      ws.send(JSON.stringify({ id, method, params }));
    });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile: false });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });

  const consoleErrors = [];
  listeners.push((m) => {
    if (m.method === "Runtime.exceptionThrown") consoleErrors.push(m.params.exceptionDetails?.text);
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
      consoleErrors.push(m.params.args?.map((a) => a.value ?? a.description).join(" "));
  });

  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`eval: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result?.value;
  };
  const navigate = async (url) => {
    await send("Page.navigate", { url });
  };
  const waitFor = async (expression, { timeout = 60000, interval = 200, label = expression } = {}) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const v = await evaluate(expression);
        if (v) return v;
      } catch {}
      await sleep(interval);
    }
    throw new Error(`timeout waiting for ${label}`);
  };
  const paint = () =>
    evaluate("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))");
  const mouse = async (type, x, y, extra = {}) =>
    send("Input.dispatchMouseEvent", { type, x, y, button: "none", ...extra });
  const shot = async (quality = 95) => {
    const r = await send("Page.captureScreenshot", { format: "jpeg", quality, optimizeForSpeed: false });
    return Buffer.from(r.data, "base64");
  };
  const close = () => {
    try {
      ws.close();
    } catch {}
    proc.kill();
    setTimeout(() => rmSync(profile, { recursive: true, force: true }), 500);
  };
  return { send, evaluate, navigate, waitFor, paint, mouse, shot, close, consoleErrors, width, height, scale };
}

/** Collects frames for a constant-rate clip; encodes with Remotion's ffmpeg. */
export function clip(name, { fps = 30 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), `rota-film-${name}-`));
  let n = 0;
  let last = null;
  const add = (buf) => {
    writeFileSync(join(dir, `f${String(n).padStart(6, "0")}.jpg`), buf);
    last = buf;
    n++;
  };
  return {
    dir,
    get frames() {
      return n;
    },
    add,
    /** Repeats the last frame k times (a still hold). */
    hold(k) {
      for (let i = 0; i < k; i++) add(last);
    },
    encode(out, { width = 1920, height = 1080 } = {}) {
      mkdirSync(join(out, ".."), { recursive: true });
      const ff = spawnSync(
        "npx",
        [
          "remotion",
          "ffmpeg",
          "-y",
          "-framerate",
          String(fps),
          "-i",
          join(dir, "f%06d.jpg"),
          "-vf",
          `scale=${width}:${height}:flags=lanczos:in_range=pc:out_range=tv`,
          "-r",
          String(fps),
          "-pix_fmt",
          "yuv420p",
          "-c:v",
          "libx264",
          "-crf",
          "18",
          "-preset",
          "slow",
          "-color_range",
          "tv",
          "-movflags",
          "+faststart",
          "-an",
          out,
        ],
        { cwd: VIDEO, stdio: ["ignore", "ignore", "pipe"] },
      );
      if (ff.status !== 0) throw new Error(`ffmpeg failed: ${String(ff.stderr).slice(-800)}`);
      rmSync(dir, { recursive: true, force: true });
      return n;
    },
  };
}

// Easing
export const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const easeOut = (x) => 1 - Math.pow(1 - x, 3);
export const lerp = (a, b, x) => a + (b - a) * x;
