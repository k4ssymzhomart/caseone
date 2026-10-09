// Round avatars for the hero's floating cards (docs/LANDING.md §5). All people in Rota are synthetic, so there are no
// photos: each avatar is a Rota mascot (vector, packages/design/assets/mascots) on a soft disc in a worker status color
// (Apple system colors from @rota/design extensions.ts, mixed over white like the app's status pills), as a tiny WebP
// with a transparent outside, in src/landing/assets/avatars/.
//   npm run landing:avatars   (tsx apps/web/scripts/landing-avatars.mjs; tsx loads the design tokens' TypeScript)
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { statusColors } from '../../../packages/design/src/extensions.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const mascots = join(repo, 'packages/design/assets/mascots');
const out = resolve(here, '../src/landing/assets/avatars');
mkdirSync(out, { recursive: true });

const SIZE = 192; // 64 CSS px at 3×
const QUALITY = 80;
const MAX_BYTES = 6 * 1024;
const TINT = 0.3; // share of the status color over white

/**
 * file name → mascot pose, the status color of its disc, and the disc in the 240 × 240 mascot artboard
 * ([centre x, centre y, diameter]): the body about two thirds of the disc, eyes a little above the middle, the feet
 * running off the bottom edge like a portrait's shoulders.
 */
const avatars = {
  'avatar-wave': { pose: 'wave', tone: 'free', disc: [105, 120, 250] },
  'avatar-wrench': { pose: 'wrench', tone: 'working', disc: [118, 124, 250] },
  'avatar-point': { pose: 'point', tone: 'queue', disc: [110, 124, 250] },
  'avatar-check': { pose: 'check', tone: 'warning', disc: [118, 124, 250] },
  'avatar-read': { pose: 'read', tone: 'off', disc: [112, 122, 250] },
};

const mix = (hex, a) => {
  const n = parseInt(hex.slice(1, 7), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(255 + (c - 255) * a));
  return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
};

for (const [name, { pose, tone, disc }] of Object.entries(avatars)) {
  const source = readFileSync(join(mascots, `${pose}.svg`), 'utf8');
  // The motion marks (the little strokes around a waving hand) turn to specks at avatar size: drop them.
  const art = source
    .slice(source.indexOf('<g id="art"'), source.lastIndexOf('</svg>'))
    .replace(/<path id="marks"[^>]*\/>/, '');
  const [cx, cy, side] = disc;
  const r = side / 2;
  const [x, y] = [cx - r, cy - r];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="${x} ${y} ${side} ${side}">
<defs><clipPath id="disc"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath></defs>
<circle cx="${cx}" cy="${cy}" r="${r}" fill="${mix(statusColors.light[tone], TINT)}"/>
<g clip-path="url(#disc)">${art}</g></svg>`;
  const dest = join(out, `${name}.webp`);
  await sharp(Buffer.from(svg), { density: 144 })
    .resize(SIZE, SIZE)
    .webp({ quality: QUALITY, alphaQuality: 90, smartSubsample: true })
    .toFile(dest);
  const bytes = statSync(dest).size;
  if (bytes > MAX_BYTES) throw new Error(`${dest} is ${bytes} bytes, over ${MAX_BYTES}`);
  console.log(
    `avatars/${name}.webp ${SIZE}×${SIZE} ${(bytes / 1024).toFixed(1)} KB (${pose}, ${tone})`,
  );
}
