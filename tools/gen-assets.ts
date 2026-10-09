// Renders the app icons, splash, notification icon and the notification sounds.
// Run before the first native build: Android notification channels freeze their sound once created,
// and a missing sound file silently falls back to the default one.
//   npm run assets
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const design = (p: string) => resolve(root, 'packages/design/assets', p);
const mobile = (p: string) => resolve(root, 'apps/mobile/assets', p);

function write(path: string, data: Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
  console.log('wrote', path.replace(root + '/', ''), `${data.byteLength} bytes`);
}

function render(svg: string, width: number): Uint8Array {
  return new Resvg(svg, { fitTo: { mode: 'width', value: width }, background: 'rgba(0,0,0,0)' })
    .render()
    .asPng();
}

/** Places an SVG file's content centered on a transparent square canvas at `scale` of its side. */
function placed(file: string, canvas: number, scale: number): string {
  const svg = readFileSync(file, 'utf8');
  const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1] ?? '0 0 100 100';
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  const side = Math.round(canvas * scale);
  const offset = Math.round((canvas - side) / 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}">
  <svg x="${offset}" y="${offset}" width="${side}" height="${side}" viewBox="${viewBox}">${inner}</svg>
</svg>`;
}

/** A PNG scaled through an SVG wrapper, so resvg does the resampling. */
function scaledPng(file: string, width: number): Uint8Array {
  const b64 = readFileSync(file).toString('base64');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1024" height="1024">
  <image width="1024" height="1024" xlink:href="data:image/png;base64,${b64}"/>
</svg>`;
  return render(svg, width);
}

/**
 * A full bleed square for masks the platform cuts itself (maskable PWA icon, apple-touch-icon): the app icon
 * scaled 1.45 × on black, so its rounded body covers every corner and the mark (64 % wide) stays inside the
 * 80 % safe zone.
 */
function fullBleedPng(file: string, width: number): Uint8Array {
  const b64 = readFileSync(file).toString('base64');
  const side = 1024 * 1.45;
  const offset = (1024 - side) / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1024" height="1024">
  <rect width="1024" height="1024" fill="#000000"/>
  <image x="${offset}" y="${offset}" width="${side}" height="${side}" xlink:href="data:image/png;base64,${b64}"/>
</svg>`;
  return render(svg, width);
}

// ---------- images ----------
write(mobile('icon.png'), readFileSync(design('app-icon/app-icon-1024.png')));
// Android adaptive icon: the red mark at 60% of a transparent 1024 canvas, inside the 66% safe zone.
write(mobile('adaptive-icon.png'), render(placed(design('logo/rota-mark-red.svg'), 1024, 0.6), 1024));
write(mobile('notification-icon.png'), render(readFileSync(design('logo/rota-mark-white.svg'), 'utf8'), 96));
write(mobile('splash-icon.png'), render(readFileSync(design('logo/rota-mark-red.svg'), 'utf8'), 512));
write(design('app-icon/app-icon-256.png'), scaledPng(design('app-icon/app-icon-1024.png'), 256));

// PWA icons (DEPLOY_VM.md §4), served from apps/mobile/public at /app/.
const pwa = (p: string) => resolve(root, 'apps/mobile/public', p);
write(pwa('icon-192.png'), scaledPng(design('app-icon/app-icon-1024.png'), 192));
write(pwa('icon-512.png'), scaledPng(design('app-icon/app-icon-1024.png'), 512));
write(pwa('icon-maskable-512.png'), fullBleedPng(design('app-icon/app-icon-1024.png'), 512));
write(pwa('apple-touch-icon.png'), fullBleedPng(design('app-icon/app-icon-1024.png'), 180));

// ---------- sounds ----------
const RATE = 44_100;

function wav(samples: Float32Array): Uint8Array {
  const data = samples.length * 2;
  const buf = Buffer.alloc(44 + data);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + data, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16); // PCM chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(data, 40);
  samples.forEach((s, i) => {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), 44 + i * 2);
  });
  return new Uint8Array(buf);
}

/**
 * Siren: 2.0 s, 960 Hz and 770 Hz alternating every 250 ms, amplitude 0.7 with soft clipping.
 * The phase is accumulated across the switches (no step in the waveform), and the loop holds
 * 960 + 770 = 1730 whole cycles, so the phase is back at zero where the loop restarts.
 */
function siren(): Float32Array {
  const n = RATE * 2;
  const out = new Float32Array(n);
  const drive = 1.6;
  const norm = Math.tanh(drive);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const segment = Math.floor(i / (RATE * 0.25));
    const f = segment % 2 === 0 ? 960 : 770;
    out[i] = (0.7 * Math.tanh(drive * Math.sin(phase))) / norm;
    phase += (2 * Math.PI * f) / RATE;
  }
  return out;
}

/** Ding: 0.35 s, 1320 Hz sine with an exponential decay and a 2 ms attack. */
function ding(): Float32Array {
  const n = Math.round(RATE * 0.35);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const attack = Math.min(1, t / 0.002);
    const tail = Math.min(1, (n - i) / (RATE * 0.01)); // end at silence
    out[i] = 0.8 * attack * tail * Math.exp(-t / 0.085) * Math.sin(2 * Math.PI * 1320 * t);
  }
  return out;
}

write(mobile('sounds/siren.wav'), wav(siren()));
write(mobile('sounds/ding.wav'), wav(ding()));
