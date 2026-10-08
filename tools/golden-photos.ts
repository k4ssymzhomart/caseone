// Renders the small synthetic photos of the ai-verify golden set (supabase/functions/ai-verify/golden/photos).
// Each is a 512×384 PNG (about 260 image tokens), so a full golden run stays cheap. Deterministic: the same
// SVG gives the same bytes, so the files only change when this script does.
//   npx tsx tools/golden-photos.ts

import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const outDir = resolve(root, 'supabase/functions/ai-verify/golden/photos');
const font = resolve(
  root,
  'node_modules/@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf',
);

const W = 512;
const H = 384;

interface PumpScene {
  /** Horizontal camera shift in px and zoom, so photos of the same unit differ between orders. */
  dx: number;
  zoom: number;
  /** Warm or cold light. */
  light: 'warm' | 'cold';
  leak: 'none' | 'heavy';
  /** Freshly painted yellow railing in the foreground. */
  railing?: boolean;
  /** Out of focus and underexposed. */
  blurry?: boolean;
}

const defs = (light: PumpScene['light']): string => `
  <defs>
    <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${light === 'warm' ? '#6a6660' : '#5a6066'}"/>
      <stop offset="1" stop-color="${light === 'warm' ? '#4c4842' : '#41464c'}"/>
    </linearGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7d7b74"/><stop offset="1" stop-color="#5f5d57"/>
    </linearGradient>
    <linearGradient id="motor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3f74a6"/><stop offset="0.45" stop-color="#2c5683"/><stop offset="1" stop-color="#1b3554"/>
    </linearGradient>
    <linearGradient id="pump" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7a877e"/><stop offset="0.5" stop-color="#5d6a61"/><stop offset="1" stop-color="#3f4943"/>
    </linearGradient>
    <radialGradient id="flange" cx="0.4" cy="0.35" r="0.7">
      <stop offset="0" stop-color="#9aa59d"/><stop offset="1" stop-color="#56615a"/>
    </radialGradient>
    <linearGradient id="pipe" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#5b5f63"/><stop offset="0.4" stop-color="#9ca0a4"/><stop offset="1" stop-color="#4a4e52"/>
    </linearGradient>
    <linearGradient id="guard" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f2c230"/><stop offset="1" stop-color="#b98c0c"/>
    </linearGradient>
    <linearGradient id="oil" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3a2508" stop-opacity="0.95"/><stop offset="1" stop-color="#170d03" stop-opacity="0.95"/>
    </linearGradient>
    <linearGradient id="vignette" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.25"/>
    </linearGradient>
    <filter id="blur"><feGaussianBlur stdDeviation="9"/></filter>
    <filter id="soft"><feGaussianBlur stdDeviation="1.2"/></filter>
  </defs>`;

function pumpUnit(leak: PumpScene['leak']): string {
  const bolts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    return `<circle cx="${(350 + 31 * Math.cos(a)).toFixed(1)}" cy="${(207 + 31 * Math.sin(a)).toFixed(1)}" r="4.2" fill="#c9ccc8" stroke="#3a3f3b" stroke-width="1.2"/>`;
  }).join('');
  const oil =
    leak === 'heavy'
      ? `
    <path d="M352 240 C350 262 344 280 330 300 C300 318 250 322 236 334 C230 346 268 356 330 354 C400 352 452 344 450 326 C446 310 404 304 384 296 C372 284 368 262 366 242 Z" fill="url(#oil)"/>
    <path d="M300 336 C330 330 380 330 420 334" stroke="#8a6a30" stroke-opacity="0.55" stroke-width="3" fill="none" filter="url(#soft)"/>
    <path d="M338 236 C336 248 339 258 336 270 C334 280 340 284 343 276 C346 262 344 250 346 238 Z" fill="#2a1a06" fill-opacity="0.9"/>
    <path d="M364 240 C366 252 362 264 365 276 C367 284 373 282 372 272 C371 262 373 252 371 240 Z" fill="#2a1a06" fill-opacity="0.9"/>
    <path d="M384 226 C392 236 394 246 392 252 L398 252 C400 244 398 234 390 224 Z" fill="#2a1a06" fill-opacity="0.85"/>
    <ellipse cx="340" cy="290" rx="4" ry="6" fill="#2a1a06"/>
    <ellipse cx="368" cy="292" rx="3" ry="5" fill="#2a1a06"/>
    <path d="M318 214 C326 222 330 232 336 240" stroke="#1d1204" stroke-opacity="0.8" stroke-width="5" fill="none"/>
    <rect x="300" y="250" width="150" height="7" fill="#1d1204" fill-opacity="0.55"/>`
      : '';
  return `
    <!-- base frame -->
    <rect x="62" y="250" width="400" height="24" fill="#3b4a3e"/>
    <rect x="62" y="250" width="400" height="5" fill="#53664f"/>
    <rect x="70" y="274" width="22" height="14" fill="#2c362e"/><rect x="432" y="274" width="22" height="14" fill="#2c362e"/>
    <!-- motor -->
    <rect x="78" y="146" width="176" height="104" rx="12" fill="url(#motor)"/>
    ${Array.from({ length: 14 }, (_, i) => `<line x1="${92 + i * 11}" y1="150" x2="${92 + i * 11}" y2="246" stroke="#173049" stroke-width="2.5" stroke-opacity="0.7"/>`).join('')}
    <rect x="60" y="156" width="26" height="84" rx="8" fill="#234466"/>
    ${Array.from({ length: 7 }, (_, i) => `<line x1="62" y1="${164 + i * 11}" x2="84" y2="${164 + i * 11}" stroke="#152a40" stroke-width="2"/>`).join('')}
    <rect x="140" y="124" width="58" height="26" rx="3" fill="#2a5078"/>
    <rect x="148" y="130" width="42" height="12" rx="2" fill="#d8dcd6"/>
    <text x="169" y="140" font-family="Inter" font-size="8" fill="#20262a" text-anchor="middle">АИР 15 кВт</text>
    <rect x="100" y="244" width="20" height="10" fill="#1a2f47"/><rect x="214" y="244" width="20" height="10" fill="#1a2f47"/>
    <!-- coupling guard -->
    <path d="M252 178 L304 178 L304 232 L252 232 Z" fill="url(#guard)"/>
    <path d="M252 178 L304 178" stroke="#ffe27a" stroke-width="3"/>
    ${Array.from({ length: 4 }, (_, i) => `<line x1="${262 + i * 12}" y1="182" x2="${262 + i * 12}" y2="228" stroke="#8a6806" stroke-width="2" stroke-opacity="0.6"/>`).join('')}
    <!-- pump body -->
    <rect x="300" y="166" width="142" height="86" rx="8" fill="url(#pump)"/>
    <rect x="394" y="226" width="44" height="18" rx="2" fill="#e4e6df"/>
    <text x="416" y="239" font-family="Inter" font-size="11" fill="#1d2320" text-anchor="middle">НШ-32</text>
    <circle cx="350" cy="207" r="40" fill="url(#flange)" stroke="#39423c" stroke-width="2"/>
    <circle cx="350" cy="207" r="22" fill="#6f7b73" stroke="#47514a" stroke-width="2"/>
    ${bolts}
    <!-- pipes -->
    <rect x="410" y="70" width="18" height="100" fill="url(#pipe)"/>
    <rect x="404" y="160" width="30" height="8" fill="#6c7074"/>
    <rect x="440" y="190" width="40" height="16" fill="url(#pipe)"/>
    <rect x="476" y="184" width="8" height="28" fill="#6c7074"/>
    ${oil}`;
}

function railing(): string {
  return `
    <g>
      <rect x="20" y="292" width="14" height="92" fill="#f4c21c"/>
      <rect x="478" y="292" width="14" height="92" fill="#f4c21c"/>
      <rect x="0" y="300" width="512" height="12" fill="#f7cc2a"/>
      <rect x="0" y="342" width="512" height="12" fill="#f7cc2a"/>
      <rect x="0" y="300" width="512" height="3" fill="#fff0a8"/>
      <rect x="0" y="342" width="512" height="3" fill="#fff0a8"/>
      ${Array.from({ length: 9 }, (_, i) => `<rect x="${60 + i * 50}" y="300" width="16" height="12" fill="#1d1d1d"/><rect x="${60 + i * 50}" y="342" width="16" height="12" fill="#1d1d1d"/>`).join('')}
    </g>`;
}

function pumpPhoto(s: PumpScene): string {
  const cx = W / 2;
  const cy = H / 2;
  const t = `translate(${cx + s.dx} ${cy}) scale(${s.zoom}) translate(${-cx} ${-cy})`;
  const scene = `
    <rect width="${W}" height="236" fill="url(#wall)"/>
    ${Array.from({ length: 5 }, (_, i) => `<line x1="${i * 120 + 40}" y1="0" x2="${i * 120 + 40}" y2="236" stroke="#3a3d40" stroke-width="2"/>`).join('')}
    <rect x="0" y="54" width="${W}" height="16" fill="#70757a"/>
    <rect x="0" y="54" width="${W}" height="4" fill="#9ea3a7"/>
    <rect x="20" y="80" width="112" height="34" fill="#c9302c"/>
    <text x="76" y="102" font-family="Inter" font-size="12" fill="#fff" text-anchor="middle">МАСЛОСТАНЦИЯ</text>
    <polygon points="0,236 ${W},236 ${W},${H} 0,${H}" fill="url(#floor)"/>
    <ellipse cx="120" cy="330" rx="60" ry="10" fill="#000" fill-opacity="0.06"/>
    <ellipse cx="430" cy="360" rx="70" ry="9" fill="#000" fill-opacity="0.05"/>
    <ellipse cx="262" cy="292" rx="215" ry="12" fill="#000" fill-opacity="0.22"/>
    <g transform="${t}">${pumpUnit(s.leak)}</g>
    ${s.railing ? railing() : ''}
    <rect width="${W}" height="${H}" fill="url(#vignette)"/>`;
  const body = s.blurry
    ? `<g filter="url(#blur)">${scene}</g><rect width="${W}" height="${H}" fill="#000" fill-opacity="0.62"/>`
    : scene;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs(s.light)}${body}</svg>`;
}

/** Конвейер К-2: the drive drum end with a freshly replaced bearing housing. */
function conveyorPhoto(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs('cold')}
    <rect width="${W}" height="${H}" fill="url(#wall)"/>
    <polygon points="0,290 ${W},290 ${W},${H} 0,${H}" fill="url(#floor)"/>
    <!-- frame -->
    <rect x="30" y="120" width="452" height="18" fill="#3d4f40"/>
    <rect x="30" y="250" width="452" height="16" fill="#3d4f40"/>
    <rect x="60" y="138" width="16" height="152" fill="#33433a"/><rect x="430" y="138" width="16" height="152" fill="#33433a"/>
    <!-- belt and drum -->
    <rect x="30" y="92" width="452" height="22" fill="#1b1b1b"/>
    <rect x="30" y="92" width="452" height="4" fill="#3a3a3a"/>
    <rect x="120" y="146" width="250" height="96" rx="46" fill="url(#pipe)"/>
    <rect x="120" y="146" width="250" height="14" rx="7" fill="#b3b7ba" fill-opacity="0.6"/>
    <!-- shaft -->
    <rect x="370" y="184" width="60" height="22" fill="#a7abae"/>
    <!-- new bearing housing (pillow block) -->
    <rect x="386" y="160" width="62" height="70" rx="10" fill="#4f6e9a"/>
    <rect x="378" y="222" width="78" height="16" rx="3" fill="#425d84"/>
    <circle cx="417" cy="195" r="20" fill="#5f81b0" stroke="#2f4566" stroke-width="2"/>
    <circle cx="417" cy="195" r="9" fill="#c7cbce"/>
    <circle cx="390" cy="230" r="4" fill="#d9dcd8"/><circle cx="444" cy="230" r="4" fill="#d9dcd8"/>
    <rect x="413" y="150" width="8" height="12" fill="#c9a227"/>
    <rect x="232" y="300" width="56" height="18" rx="2" fill="#e4e6df"/>
    <text x="260" y="313" font-family="Inter" font-size="11" fill="#1d2320" text-anchor="middle">К-2</text>
    <rect width="${W}" height="${H}" fill="url(#vignette)"/>
  </svg>`;
}

const PHOTOS: Record<string, string> = {
  'pump_leak_a.png': pumpPhoto({ dx: 0, zoom: 1, light: 'warm', leak: 'heavy' }),
  'pump_clean_a.png': pumpPhoto({ dx: 6, zoom: 1.04, light: 'warm', leak: 'none' }),
  'pump_clean_b.png': pumpPhoto({ dx: -24, zoom: 1.12, light: 'cold', leak: 'none' }),
  'pump_leak_b.png': pumpPhoto({ dx: 18, zoom: 0.96, light: 'cold', leak: 'heavy' }),
  'pump_painted_leak.png': pumpPhoto({
    dx: 14,
    zoom: 0.98,
    light: 'cold',
    leak: 'heavy',
    railing: true,
  }),
  'pump_leak_c.png': pumpPhoto({ dx: -10, zoom: 1.06, light: 'warm', leak: 'heavy' }),
  'pump_clean_c.png': pumpPhoto({ dx: -6, zoom: 1.08, light: 'warm', leak: 'none' }),
  'pump_leak_d.png': pumpPhoto({ dx: 26, zoom: 1, light: 'cold', leak: 'heavy' }),
  'pump_clean_d.png': pumpPhoto({ dx: 20, zoom: 1.02, light: 'cold', leak: 'none' }),
  'pump_leak_e.png': pumpPhoto({ dx: -18, zoom: 0.98, light: 'warm', leak: 'heavy' }),
  'pump_blurry.png': pumpPhoto({ dx: 4, zoom: 1.3, light: 'warm', leak: 'none', blurry: true }),
  'conveyor_k2_bearing_new.png': conveyorPhoto(),
};

mkdirSync(outDir, { recursive: true });
for (const [name, svg] of Object.entries(PHOTOS)) {
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: W },
    background: '#000000',
    font: { fontFiles: [font], loadSystemFonts: false, defaultFontFamily: 'Inter' },
  })
    .render()
    .asPng();
  writeFileSync(resolve(outDir, name), png);
  console.log('wrote', name, `${png.byteLength} bytes`);
}
