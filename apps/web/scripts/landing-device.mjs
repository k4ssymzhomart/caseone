// Screens for the DeviceFrame phone (src/landing/ui/DeviceFrame.tsx): real app screenshots fitted to the 1206 × 2622
// display of the 6.3 inch Pro, with the Dynamic Island the simulator baked in painted over (the frame draws its own,
// crisp at any density) and the simulator's «no service» dots turned into four signal bars (what
// `xcrun simctl status_bar booted override --cellularMode active --cellularBars 4` shows), as WebP at two widths for
// srcset, plus deviceScreens.ts with the URLs and sizes. A screen captured in the Russian locale prints the clock as
// «09:41»; `dropClockZero` takes the leading zero off and recentres «9:41» the way iOS lays out the shorter time.
//   npm run landing:device   (node apps/web/scripts/landing-device.mjs)
// Sources: docs/screenshots/presentation/mobile (release build on real data). The other landing images come from
// landing-shots.mjs; this script touches only src/landing/assets/device/ and deviceScreens.ts.
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const assets = resolve(here, '../src/landing/assets');
const out = join(assets, 'device');
mkdirSync(out, { recursive: true });

const DISPLAY = { width: 1206, height: 2622 };
const WIDTHS = [600, 900];
const QUALITY = 84;
const MAX_BYTES = 200 * 1024;

/** name in the page → screenshot in docs/screenshots/presentation/mobile */
const screens = {
  masterShift: '02-master-shift.png',
  createAi: '08-master-create-ai-suggestion.png',
  emergency: '09-worker-emergency.png',
  workerReport: '15-worker-ai-report.png',
  aiReport: '28-master-ai-report-sonnet.png',
  // Light theme for the light hero: the 17 Pro simulator with `rota.theme` set to light and
  // `xcrun simctl status_bar booted override --time 9:41 --cellularMode active --cellularBars 4 --wifiBars 3
  // --batteryState discharging --batteryLevel 100` (real signal bars, so nothing to redraw).
  masterShiftLight: { file: '30-master-shift-light.png', dropClockZero: true },
};

/**
 * Paints over the island the simulator draws into the status bar. It is found as the near black box in the top
 * band; on a black status bar it is invisible and the box fills the whole band, so nothing is painted.
 */
async function withoutIsland(file, { dropClockZero = false } = {}) {
  const { data, info } = await sharp(file)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, channels } = info;
  const at = (x, y) => (y * width + x) * channels;
  let minX = Infinity;
  let maxX = -1;
  let minY = Infinity;
  let maxY = -1;
  for (let y = 0; y < 200; y++) {
    for (let x = Math.round(width * 0.3); x < width * 0.7; x++) {
      const i = at(x, y);
      if (data[i] < 10 && data[i + 1] < 10 && data[i + 2] < 10) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  const found = maxY > 0 && minY > 8 && maxY - minY < 140;
  if (found) {
    const fill = data.slice(
      at(minX - 16, Math.round((minY + maxY) / 2)),
      at(minX - 16, Math.round((minY + maxY) / 2)) + 3,
    );
    for (let y = minY - 3; y <= maxY + 3; y++) {
      for (let x = minX - 3; x <= maxX + 3; x++) {
        const i = at(x, y);
        data[i] = fill[0];
        data[i + 1] = fill[1];
        data[i + 2] = fill[2];
      }
    }
  }
  const clock = dropClockZero && withoutClockZero(data, info);
  const bars = signalBars(data, info);
  let image = sharp(data, { raw: info });
  if (bars)
    image = sharp(
      await image
        .composite([{ input: Buffer.from(bars), left: 0, top: 0 }])
        .png()
        .toBuffer(),
    );
  return { image, island: found, bars: Boolean(bars), clock: Boolean(clock) };
}

/**
 * «09:41» → «9:41»: finds the clock's glyphs (columns that differ from the status bar in its left third), paints the
 * first one out and moves the rest left by half its advance, so the time stays centred where iOS centres it.
 */
function withoutClockZero(data, info) {
  const { width, channels } = info;
  const at = (x, y) => (y * width + x) * channels;
  const bg = data.slice(at(8, 100), at(8, 100) + 3);
  const differs = (x, y) => {
    const i = at(x, y);
    return (
      Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]) > 40
    );
  };
  const runs = [];
  let y0 = Infinity;
  let y1 = -1;
  for (let x = 0, start = -1; x < width * 0.3; x++) {
    let ink = false;
    for (let y = 40; y < 160; y++) {
      if (!differs(x, y)) continue;
      ink = true;
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    if (ink && start < 0) start = x;
    if (!ink && start >= 0) {
      runs.push([start, x - 1]);
      start = -1;
    }
  }
  if (runs.length !== 5) return false; // d d : d d
  const shift = Math.round((runs[1][0] - runs[0][0]) / 2);
  const [left, right, top, bottom] = [runs[0][0] - 2, runs[4][1] + 2, y0 - 2, y1 + 2];
  const from = runs[1][0] - 2;
  const copy = [];
  for (let y = top; y <= bottom; y++)
    copy.push(Buffer.from(data.subarray(at(from, y), at(right + 1, y))));
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) data.set(bg, at(x, y));
    data.set(copy[y - top], at(from - shift, y));
  }
  return true;
}

/**
 * The simulator has no carrier, so the status bar shows four dim dots left of the Wi‑Fi glyph. Finds them (four
 * small squares, bottom aligned with the Wi‑Fi glyph, much dimmer than it), paints them with the status bar color and
 * returns an SVG overlay with four rising bars in the glyph color on the same positions; null when they are not there.
 */
function signalBars(data, info) {
  const { width, height, channels } = info;
  const px = (x, y) => {
    const i = (y * width + x) * channels;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const bg = px(Math.round(width * 0.66), 30);
  const differs = (p) =>
    Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) > 40;
  const runs = [];
  let cur = null;
  for (let x = Math.round(width * 0.62); x < width - 20; x++) {
    let y0 = -1;
    let y1 = -1;
    let peak = 0;
    for (let y = 40; y < 150; y++) {
      const p = px(x, y);
      if (!differs(p)) continue;
      if (y0 < 0) y0 = y;
      y1 = y;
      peak = Math.max(peak, lum(p));
    }
    if (y0 >= 0) {
      if (!cur) cur = { x0: x, x1: x, y0, y1, peak };
      else
        Object.assign(cur, {
          x1: x,
          y0: Math.min(cur.y0, y0),
          y1: Math.max(cur.y1, y1),
          peak: Math.max(cur.peak, peak),
        });
    } else if (cur) {
      runs.push(cur);
      cur = null;
    }
  }
  const wifiAt = runs.findIndex((r) => r.peak > 200 && r.y1 - r.y0 > 25);
  if (wifiAt < 4) return null;
  const wifi = runs[wifiAt];
  const dots = runs.slice(wifiAt - 4, wifiAt);
  const small = dots.every(
    (d) =>
      d.x1 - d.x0 < 15 &&
      d.y1 - d.y0 < 15 &&
      Math.abs(d.y1 - wifi.y1) <= 2 &&
      d.peak < wifi.peak * 0.75,
  );
  if (!small || wifi.y1 >= height) return null;

  for (const d of dots) {
    for (let y = d.y0 - 2; y <= d.y1 + 2; y++) {
      for (let x = d.x0 - 2; x <= d.x1 + 2; x++) {
        const i = (y * width + x) * channels;
        data[i] = bg[0];
        data[i + 1] = bg[1];
        data[i + 2] = bg[2];
      }
    }
  }
  const glyph = px(Math.round((wifi.x0 + wifi.x1) / 2), wifi.y1 - 2);
  const color = `rgb(${glyph.join(',')})`;
  const h = wifi.y1 - wifi.y0 + 1;
  const rects = dots
    .map((d, i) => {
      const bh = Math.round(h * [0.36, 0.54, 0.72, 0.9][i]);
      const w = d.x1 - d.x0 + 1;
      return `<rect x="${d.x0}" y="${wifi.y1 + 1 - bh}" width="${w}" height="${bh}" rx="${(w * 0.28).toFixed(1)}" fill="${color}"/>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${rects}</svg>`;
}

const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const entries = [];

for (const [name, screen] of Object.entries(screens)) {
  const { file, ...options } = typeof screen === 'string' ? { file: screen } : screen;
  const { image, island, bars, clock } = await withoutIsland(
    join(repo, 'docs/screenshots/presentation/mobile', file),
    options,
  );
  const fitted = await image
    .resize(DISPLAY.width, DISPLAY.height, { fit: 'cover', position: 'top', kernel: 'lanczos3' })
    .png()
    .toBuffer();
  const files = [];
  for (const w of WIDTHS) {
    const dest = join(out, `${kebab(name)}-${w}.webp`);
    const info = await sharp(fitted)
      .resize({ width: w, kernel: 'lanczos3' })
      .webp({ quality: QUALITY, smartSubsample: true })
      .toFile(dest);
    const bytes = statSync(dest).size;
    if (bytes > MAX_BYTES) throw new Error(`${dest} is ${bytes} bytes, over ${MAX_BYTES}`);
    files.push({
      file: `device/${kebab(name)}-${w}.webp`,
      width: info.width,
      height: info.height,
      id: `${name}${w}`,
    });
    console.log(
      `device/${kebab(name)}-${w}.webp ${info.width}×${info.height} ${Math.round(bytes / 1024)} KB${island ? ' (island painted over)' : ''}${bars ? ' (signal bars)' : ''}${clock ? ' (clock 9:41)' : ''}`,
    );
  }
  entries.push({ name, files });
}

const ts = [
  '// Generated by scripts/landing-device.mjs. Do not edit by hand.',
  ...entries.flatMap((e) => e.files.map((f) => `import ${f.id} from './${f.file}';`)),
  '',
  '/** A real app screen fitted to the 1206 × 2622 display, at two widths for srcset. */',
  'export interface DeviceScreen {',
  '  src: string;',
  '  srcSet: string;',
  '  width: number;',
  '  height: number;',
  '}',
  '',
  'export const deviceScreens = {',
  ...entries.map((e) => {
    const big = e.files[e.files.length - 1];
    const set = e.files.map((f) => `\${${f.id}} ${f.width}w`).join(', ');
    return [
      `  ${e.name}: {`,
      `    src: ${big.id},`,
      `    srcSet: \`${set}\`,`,
      `    width: ${big.width},`,
      `    height: ${big.height},`,
      '  },',
    ].join('\n');
  }),
  '} satisfies Record<string, DeviceScreen>;',
  '',
  'export type DeviceScreenName = keyof typeof deviceScreens;',
  '',
].join('\n');
writeFileSync(join(assets, 'deviceScreens.ts'), ts);
console.log('deviceScreens.ts');
