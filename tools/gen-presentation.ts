// The jury presentation (case §12: at most 10 slides). The slides are one HTML file, docs/presentation/src/index.html,
// 1920 × 1080 each, with the fonts from node_modules and the real screens from docs/screenshots by relative path.
// This script renders it with the headless Chrome already installed on the Mac, through the DevTools protocol:
//   docs/presentation/src/logos/*.svg        the platform marks, written from packages/design/src/brand/platforms.ts
//   docs/presentation/slides/01.png … 10.png  one PNG per slide, 1920 × 1080
//   docs/presentation/rota-presentation.pdf   Page.printToPDF, preferCSSPageSize, 1920 × 1080 pages
//   apps/web/public/rota-presentation.pdf     the same file, served by the site at /rota-presentation.pdf
//
//   npx tsx tools/gen-presentation.ts            everything
//   npx tsx tools/gen-presentation.ts --no-png   logos and the PDF only
//   npx tsx tools/gen-presentation.ts --draft    print layout problems and render anyway
// CHROME=/path/to/chrome overrides the browser. Run npm install first: the fonts load from node_modules.
//
// The page is served from a local HTTP server rooted at the repo. For the PNGs it serves every file as it is; for the
// PDF it re-encodes the raster screenshots as JPEG (Chrome embeds a JPEG as is but stores a PNG as raw pixels), so the
// PDF stays small enough for the site. The layout check after loading fails the run when anything leaves its slide.
import { spawn } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import sharp from 'sharp';
import { platformLogos, type PlatformLogo } from '../packages/design/src/brand/platforms.ts';

const repo = resolve(import.meta.dirname, '..');
const src = join(repo, 'docs/presentation/src');
const slidesDir = join(repo, 'docs/presentation/slides');
const pdfFile = join(repo, 'docs/presentation/rota-presentation.pdf');
const siteCopy = join(repo, 'apps/web/public/rota-presentation.pdf');
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const withPng = !process.argv.includes('--no-png');
const draft = process.argv.includes('--draft'); // report layout problems instead of failing
const W = 1920;
const H = 1080;

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const rel = (p: string) => p.replace(`${repo}/`, '');

// ---------------------------------------------------------------------------------------------------------------
// Platform marks: the real logos in their colors for the dark canvas (24 × 24, one file per mark).

function writeLogos(): void {
  const dir = join(src, 'logos');
  mkdirSync(dir, { recursive: true });
  for (const [name, logo] of Object.entries(platformLogos) as [string, PlatformLogo][]) {
    const art = logo.art
      ? logo.art.map((a) => `<path fill="${a.color}" d="${a.d}"/>`).join('')
      : logo.paths.map((d) => `<path fill="${logo.onDark}" d="${d}"/>`).join('');
    const detail = logo.detail
      ? logo.detail.paths.map((d) => `<path fill="${logo.detail!.color}" d="${d}"/>`).join('')
      : '';
    const label = logo.label
      ? `<text x="12" y="16.2" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="10" fill="${logo.label.color}">${esc(logo.label.text)}</text>`
      : '';
    writeFileSync(
      join(dir, `${name}.svg`),
      `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" role="img" aria-label="${esc(logo.title)}"><title>${esc(logo.title)}</title>${art}${detail}${label}</svg>\n`,
    );
  }
  console.log(`logos   ${Object.keys(platformLogos).length} marks in ${rel(dir)}`);
}

// ---------------------------------------------------------------------------------------------------------------
// A static server rooted at the repo. Mode 'pdf' turns PNG and JPEG screenshots into JPEG at most 2000 px wide.

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};
let mode: 'png' | 'pdf' = 'png';
const jpegCache = new Map<string, Buffer>();

async function body(file: string): Promise<{ data: Buffer; type: string }> {
  const ext = extname(file).toLowerCase();
  const raster = ext === '.png' || ext === '.jpg' || ext === '.jpeg';
  if (mode === 'pdf' && raster && file.includes(`${sep}docs${sep}screenshots${sep}`)) {
    let data = jpegCache.get(file);
    if (!data) {
      data = await sharp(file)
        .resize({ width: 2000, withoutEnlargement: true })
        .flatten({ background: '#000000' })
        .jpeg({ quality: 88, mozjpeg: true })
        .toBuffer();
      jpegCache.set(file, data);
    }
    return { data, type: 'image/jpeg' };
  }
  return { data: readFileSync(file), type: TYPES[ext] ?? 'application/octet-stream' };
}

const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  const file = resolve(repo, `.${path}`);
  if (!file.startsWith(repo + sep) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end();
    return;
  }
  body(file).then(
    ({ data, type }) =>
      res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }).end(data),
    (err: unknown) => res.writeHead(500).end(String(err)),
  );
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const pageUrl = `${origin}/docs/presentation/src/index.html`;

// ---------------------------------------------------------------------------------------------------------------
// Chrome over the DevTools protocol (Node's global fetch and WebSocket, no dependencies).

const profile = mkdtempSync(join(tmpdir(), 'rota-presentation-'));
const proc = spawn(
  chrome,
  [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--force-color-profile=srgb',
    'about:blank',
  ],
  { stdio: 'ignore' },
);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function devtoolsPort(): Promise<number> {
  const file = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100; i++) {
    if (existsSync(file)) {
      const port = Number(readFileSync(file, 'utf8').split('\n')[0]);
      if (port > 0) return port;
    }
    await sleep(100);
  }
  throw new Error('Chrome did not start');
}

async function pageSocket(port: number): Promise<string> {
  for (let i = 0; i < 50; i++) {
    try {
      const list = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as {
        type: string;
        webSocketDebuggerUrl: string;
      }[];
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // not up yet
    }
    await sleep(100);
  }
  throw new Error('Chrome has no page target');
}

type Json = Record<string, unknown>;
const ws = new WebSocket(await pageSocket(await devtoolsPort()));
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pending = new Map<number, { ok: (v: Json) => void; fail: (e: Error) => void }>();
const waiters = new Map<string, (() => void)[]>();
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(String(ev.data)) as {
    id?: number;
    method?: string;
    result?: Json;
    error?: { message: string };
  };
  if (msg.id !== undefined) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) p?.fail(new Error(msg.error.message));
    else p?.ok(msg.result ?? {});
  } else if (msg.method) {
    for (const w of waiters.get(msg.method) ?? []) w();
    waiters.delete(msg.method);
  }
});
const send = (method: string, params: Json = {}) =>
  new Promise<Json>((ok, fail) => {
    const id = ++seq;
    pending.set(id, { ok, fail });
    ws.send(JSON.stringify({ id, method, params }));
  });
const once = (method: string) =>
  new Promise<void>((r) => waiters.set(method, [...(waiters.get(method) ?? []), r]));
async function evaluate<T>(expression: string): Promise<T> {
  const res = (await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })) as {
    result: { value: T };
    exceptionDetails?: { text: string };
  };
  if (res.exceptionDetails) throw new Error(`page: ${res.exceptionDetails.text}`);
  return res.result.value;
}

// Loads the deck, waits for fonts and every image, then checks the layout: every image and both fonts loaded, nothing
// outside its slide or cut off by a clipping card (elements marked .bleed are exempt), nothing running into the footer
// line, no text box wider than its own box. Any problem fails the run unless --draft is given.
async function load(): Promise<number> {
  const res = await layout();
  if (res.problems.length) {
    const text = res.problems.join('\n');
    if (!draft) throw new Error(`layout check failed:\n${text}`);
    console.warn(`layout  ${res.problems.length} problems (draft):\n${text}`);
  }
  return res.count;
}

async function layout(): Promise<{ count: number; problems: string[] }> {
  const loaded = once('Page.loadEventFired');
  await send('Page.navigate', { url: pageUrl });
  await loaded;
  return evaluate<{ count: number; problems: string[] }>(`(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((i) => i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; })));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const problems = [];
    for (const img of document.images) if (!img.naturalWidth) problems.push('image not loaded: ' + img.getAttribute('src'));
    const loaded = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, ''));
    for (const f of ['Inter', 'Geist Mono']) if (!loaded.includes(f)) problems.push('font not loaded: ' + f);
    for (const f of document.fonts) if (f.status === 'error') problems.push('font failed: ' + f.family + ' ' + f.weight);
    const slides = [...document.querySelectorAll('.slide')];
    slides.forEach((slide, i) => {
      const box = slide.getBoundingClientRect();
      // Nothing may run into the footer line (the source and the page number).
      const foot = slide.querySelector('.foot');
      const fr = foot ? foot.getBoundingClientRect() : null;
      if (fr) for (const el of slide.querySelectorAll('h1, h2, h3, h4, p, span, b, div, img, a')) {
        if (foot.contains(el) || el.contains(foot) || el.closest('.bleed')) continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        if (r.width >= box.width - 1 && r.height >= box.height - 1) continue; // full slide decor: glow, shade
        if (r.bottom > fr.top - 8 && r.top < fr.bottom && r.right > fr.left && r.left < fr.right)
          problems.push('slide ' + (i + 1) + ': runs into the footer: ' + el.tagName.toLowerCase() + ' ' + (el.textContent || '').trim().slice(0, 40));
      }
      for (const el of slide.querySelectorAll('*')) {
        if (el.closest('.bleed')) continue;
        const r = el.getBoundingClientRect();
        if (!r.width && !r.height) continue;
        const out = r.left < box.left - 0.5 || r.right > box.right + 0.5 || r.top < box.top - 0.5 || r.bottom > box.bottom + 0.5;
        if (out) problems.push('slide ' + (i + 1) + ': outside the slide: ' + el.tagName.toLowerCase() + '.' + el.className + ' ' + (el.textContent || '').trim().slice(0, 40));
        // Content cut off by a clipping box (a card with overflow hidden) counts as overflow too.
        for (let a = el.parentElement; a && a !== slide; a = a.parentElement) {
          if (getComputedStyle(a).overflow === 'visible') continue;
          const c = a.getBoundingClientRect();
          if (r.left < c.left - 0.5 || r.right > c.right + 0.5 || r.top < c.top - 0.5 || r.bottom > c.bottom + 0.5)
            problems.push('slide ' + (i + 1) + ': clipped by ' + a.tagName.toLowerCase() + '.' + a.className + ': ' + (el.textContent || el.getAttribute('src') || '').trim().slice(0, 40));
          break;
        }
        const cs = getComputedStyle(el);
        if (el.scrollWidth > el.clientWidth + 1 && cs.overflow === 'visible' && el.clientWidth > 0 && el.children.length === 0)
          problems.push('slide ' + (i + 1) + ': text wider than its box: ' + (el.textContent || '').trim().slice(0, 40));
      }
    });
    return { count: slides.length, problems };
  })()`);
}

try {
  writeLogos();
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: W,
    height: H,
    deviceScaleFactor: 1,
    mobile: false,
  });

  // PNGs from the original screenshots.
  mode = 'png';
  const count = await load();
  if (count < 1 || count > 10) throw new Error(`expected 1 to 10 slides, found ${count}`);
  if (withPng) {
    rmSync(slidesDir, { recursive: true, force: true });
    mkdirSync(slidesDir, { recursive: true });
    for (let i = 0; i < count; i++) {
      const shot = (await send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
        clip: { x: 0, y: i * H, width: W, height: H, scale: 1 },
      })) as { data: string };
      const file = join(slidesDir, `${String(i + 1).padStart(2, '0')}.png`);
      const info = await sharp(Buffer.from(shot.data, 'base64'))
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toFile(file);
      console.log(
        `png     ${rel(file)}  ${info.width}×${info.height}  ${Math.round(info.size / 1024)} KB`,
      );
    }
  }

  // The PDF from JPEG screenshots.
  mode = 'pdf';
  await load();
  const pdf = (await send('Page.printToPDF', {
    preferCSSPageSize: true,
    printBackground: true,
    marginTop: 0,
    marginBottom: 0,
    marginLeft: 0,
    marginRight: 0,
    transferMode: 'ReturnAsStream',
  })) as { stream: string };
  const chunks: Buffer[] = [];
  for (;;) {
    const part = (await send('IO.read', { handle: pdf.stream, size: 1 << 20 })) as {
      data: string;
      eof: boolean;
      base64Encoded?: boolean;
    };
    chunks.push(Buffer.from(part.data, part.base64Encoded ? 'base64' : 'latin1'));
    if (part.eof) break;
  }
  await send('IO.close', { handle: pdf.stream });
  const bytes = Buffer.concat(chunks);
  const pages = (bytes.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  if (pages !== count) throw new Error(`the PDF has ${pages} pages for ${count} slides`);
  writeFileSync(pdfFile, bytes);
  mkdirSync(resolve(siteCopy, '..'), { recursive: true });
  copyFileSync(pdfFile, siteCopy);
  const mb = (bytes.length / 1024 / 1024).toFixed(1);
  console.log(`pdf     ${rel(pdfFile)}  ${pages} pages  ${mb} MB`);
  console.log(`pdf     ${rel(siteCopy)}  (copy for the site)`);
} finally {
  ws.close();
  const exited = new Promise((r) => proc.once('exit', r));
  proc.kill('SIGKILL');
  await Promise.race([exited, sleep(3000)]);
  server.close();
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // Chrome may still hold a file in its temporary profile; the OS cleans the temp folder.
  }
}
