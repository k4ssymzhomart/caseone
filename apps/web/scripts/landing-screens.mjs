// Full page screenshots of the landing through headless Chrome and the DevTools protocol (the tools/web-screens.ts
// approach: no Playwright, the Chrome already installed on the Mac). The script scrolls through the page once, so
// every lazy image loads and every reveal plays, then captures viewport tiles and stitches them with sharp (one
// capture of the whole page hangs headless Chrome). PNGs are palette compressed.
//   cd apps/web && npx vite --port 5174 --strictPort          (or: npx vite preview --port 5174 --strictPort)
//   node apps/web/scripts/landing-screens.mjs [--base http://localhost:5174] [--only 1440,390] [--out dir] [--motion]
// Default outputs: docs/landing/shots/desktop.png (1440), docs/landing/shots/mobile.png (390) and
// docs/screenshots/presentation/web/w00-landing.png (1440). With --out, every width goes to <out>/landing-<w>.png.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const base = arg('--base', 'http://localhost:5174');
const out = arg('--out', '');
// Reduced motion by default: the HUD shows its last state and the marquee stands still, so shots are repeatable.
const motion = args.includes('--motion');
const only = arg('--only', '1440,390')
  .split(',')
  .map((x) => Number(x.trim()))
  .filter(Boolean);

/** width → { dpr, files } */
function targets(width) {
  if (out) return { dpr: width < 768 ? 2 : 1, files: [resolve(out, `landing-${width}.png`)] };
  if (width === 1440) {
    return {
      dpr: 1,
      files: [join(repo, 'docs/landing/shots/desktop.png'), join(repo, 'docs/screenshots/presentation/web/w00-landing.png')],
    };
  }
  if (width === 390) return { dpr: 1, files: [join(repo, 'docs/landing/shots/mobile.png')] };
  return { dpr: 1, files: [join(repo, `docs/landing/shots/landing-${width}.png`)] };
}

const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9341;
const proc = spawn(
  chrome,
  [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${join(tmpdir(), `rota-landing-shots-${Date.now()}`)}`,
    '--hide-scrollbars',
    '--force-dark-mode',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // Chrome not up yet
    }
    await sleep(200);
  }
  throw new Error('Chrome did not start');
}

const ws = new WebSocket(await target());
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(String(ev.data));
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result ?? {});
    pending.delete(msg.id);
  }
});
const debug = process.env.DEBUG ? (...a) => console.log('·', ...a) : () => {};
const send = (method, params = {}) =>
  new Promise((res) => {
    const id = ++seq;
    debug(method);
    pending.set(id, res);
    ws.send(JSON.stringify({ id, method, params }));
  });

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return r.result?.value;
}

const VIEW_H = 1000;

try {
  await send('Page.enable');
  await send('Runtime.enable');
  if (!motion) {
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  }
  for (const width of only) {
    const { dpr, files } = targets(width);
    const mobile = width < 768;
    await send('Emulation.setDeviceMetricsOverride', { width, height: VIEW_H, deviceScaleFactor: dpr, mobile });
    await send('Page.navigate', { url: `${base}/` });
    await sleep(2500);
    // Scroll through once: lazy images load, reveals and the typed line play.
    let h = Number(await evaluate('document.documentElement.scrollHeight'));
    for (let y = 0; y < h; y += VIEW_H / 2) {
      await evaluate(`window.scrollTo(0, ${y})`);
      await sleep(250);
    }
    await sleep(1500);
    // The fixed nav stays at the top of the page, so it shows once.
    await evaluate(`window.scrollTo(0, 0); document.querySelector('header').style.position = 'absolute'; true`);
    await sleep(600);
    h = Number(await evaluate('document.documentElement.scrollHeight'));
    debug('height', h);
    // Layout check: horizontal scroll, and text that sticks out of the viewport.
    const overflow = await evaluate(`(() => {
      const out = [];
      for (const el of document.querySelectorAll('h1, h2, h3, p, li, a, summary, td, th, figure, img')) {
        if (el.closest('[aria-hidden="true"]')) continue;
        const r = el.getBoundingClientRect();
        if (r.width && (r.right > innerWidth + 1 || r.left < -1)) out.push(el.tagName + ' ' + (el.textContent || el.alt || '').trim().slice(0, 40));
      }
      return { scroll: document.documentElement.scrollWidth > innerWidth, out: out.slice(0, 12) };
    })()`);
    if (overflow?.scroll || overflow?.out?.length) console.log(`overflow at ${width}:`, JSON.stringify(overflow));
    // Capture viewport tiles and stitch them (one huge capture hangs headless Chrome).
    const tiles = [];
    for (let y = 0; y < h; y += VIEW_H) {
      const actual = Number(await evaluate(`window.scrollTo(0, ${y}); window.scrollY`));
      await sleep(400);
      const res = await send('Page.captureScreenshot', { format: 'png' });
      tiles.push({ input: Buffer.from(res.data, 'base64'), top: Math.round(actual * dpr), left: 0 });
    }
    const raw = await sharp({
      create: { width: width * dpr, height: h * dpr, channels: 4, background: '#000000' },
    })
      .composite(tiles)
      .png()
      .toBuffer();
    const png = await sharp(raw).png({ palette: true, quality: 90, compressionLevel: 9 }).toBuffer();
    for (const file of files) {
      mkdirSync(dirname(file), { recursive: true });
      await sharp(png).toFile(file);
      console.log(`wrote ${file.replace(`${repo}/`, '')} ${width}×${h} @${dpr}x ${Math.round(png.length / 1024)} KB`);
    }
  }
} finally {
  ws.close();
  proc.kill();
}
