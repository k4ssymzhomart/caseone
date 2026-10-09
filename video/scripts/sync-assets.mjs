// Copies what Remotion's bundler serves from public/ out of the monorepo:
// brand assets from packages/design, the Inter and Geist Mono TTFs from the root node_modules,
// and the presentation stills from docs/screenshots/presentation. The copies are git ignored;
// run this before `remotion studio` or `remotion render` (the npm scripts do it for you).
// Footage in public/footage is never touched.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const video = resolve(here, "..");
const repo = resolve(video, "..");
const pub = join(video, "public");

const copyDir = (from, to, filter = () => true) => {
  if (!existsSync(from)) {
    console.warn(`skip: ${from} does not exist`);
    return 0;
  }
  rmSync(to, { recursive: true, force: true });
  mkdirSync(to, { recursive: true });
  let n = 0;
  for (const name of readdirSync(from)) {
    const src = join(from, name);
    if (statSync(src).isDirectory() || !filter(name)) continue;
    cpSync(src, join(to, name));
    n += 1;
  }
  return n;
};

const copyFile = (from, to) => {
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to);
};

// Brand: logo lockups and marks, dark mascots, app icon, wallpaper.
const design = join(repo, "packages/design/assets");
const brand = join(pub, "brand");
let count = copyDir(join(design, "logo"), join(brand, "logo"), (f) => f.endsWith(".svg"));
count += copyDir(join(design, "mascots/dark"), join(brand, "mascots"), (f) => f.endsWith(".svg"));
copyFile(join(design, "app-icon/app-icon-1024.png"), join(brand, "app-icon-1024.png"));
copyFile(join(design, "wallpaper.jpg"), join(brand, "wallpaper.jpg"));
count += 2;

// Fonts: the same TTFs the apps bundle (Inter stands in for SF Pro, Geist Mono for numbers and eyebrows).
const fonts = join(pub, "fonts");
rmSync(fonts, { recursive: true, force: true });
mkdirSync(fonts, { recursive: true });
const fontFiles = [
  ["inter", "400Regular", "Inter_400Regular.ttf"],
  ["inter", "500Medium", "Inter_500Medium.ttf"],
  ["inter", "600SemiBold", "Inter_600SemiBold.ttf"],
  ["inter", "700Bold", "Inter_700Bold.ttf"],
  ["inter", "800ExtraBold", "Inter_800ExtraBold.ttf"],
  ["geist-mono", "400Regular", "GeistMono_400Regular.ttf"],
  ["geist-mono", "500Medium", "GeistMono_500Medium.ttf"],
  ["geist-mono", "600SemiBold", "GeistMono_600SemiBold.ttf"],
];
for (const [pkg, dir, file] of fontFiles) {
  const src = join(repo, "node_modules/@expo-google-fonts", pkg, dir, file);
  if (!existsSync(src)) {
    throw new Error(`Missing ${src}. Run npm install at the repo root first.`);
  }
  copyFile(src, join(fonts, file));
  count += 1;
}

// Stills: the real screens, used wherever public/footage has no recording yet.
const shots = join(repo, "docs/screenshots/presentation");
const stills = join(pub, "stills");
for (const folder of ["mobile", "pwa", "web", "web-live", "hero"]) {
  count += copyDir(join(shots, folder), join(stills, folder), (f) => f.endsWith(".png"));
}

// Check the pixel sizes the scenes assume (src/data/stills.ts) against the files.
const pngSize = (file) => {
  const b = readFileSync(file);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
};
const table = readFileSync(join(video, "src/data/stills.ts"), "utf8");
const rows = [...table.matchAll(/"([\w/.-]+\.png)":\s*\[(\d+),\s*(\d+)\]/g)];
let mismatches = 0;
for (const [, name, w, h] of rows) {
  const file = join(stills, name);
  if (!existsSync(file)) {
    console.warn(`missing still: ${name}`);
    mismatches += 1;
    continue;
  }
  const size = pngSize(file);
  if (size.width !== Number(w) || size.height !== Number(h)) {
    console.warn(`size changed: ${name} is ${size.width}x${size.height}, src/data/stills.ts says ${w}x${h}`);
    mismatches += 1;
  }
}

mkdirSync(join(pub, "footage"), { recursive: true });
console.log(`synced ${count} files into public/ (${rows.length} stills checked, ${mismatches} problems)`);
