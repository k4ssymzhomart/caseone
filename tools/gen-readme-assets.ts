// The README showcase assets in docs/readme/: platform logos and badges (SVG, written here), the banner, the order
// loop strip, the number cards and the screen gallery (PNG, rendered from HTML by the headless Chrome already
// installed on the Mac, with the Inter and Geist Mono files from node_modules). Every picture uses the real
// presentation screenshots in docs/screenshots/presentation/; nothing is redrawn.
//   npx tsx tools/gen-readme-assets.ts                       everything
//   npx tsx tools/gen-readme-assets.ts --only logos,badges   some parts: logos, badges, banner, loop, stats, screens,
//                                                            arch, film
// film runs only when named: docs/readme/film.png is now a frame of the final cut, and this part draws the old poster
// of the 2:55 draft over it (it also needs the frames named at writeFilm).
// CHROME=/path/to/chrome overrides the browser. Output PNGs are palette compressed with sharp.
import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import {
  platformLogos,
  type PlatformLogo,
  type PlatformLogoName,
} from '../packages/design/src/brand/platforms.ts';

const repo = resolve(import.meta.dirname, '..');
const out = join(repo, 'docs/readme');
const shots = join(repo, 'docs/screenshots/presentation');
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const args = process.argv.slice(2);
const onlyArg = args.includes('--only') ? (args[args.indexOf('--only') + 1] ?? '') : '';
const only = new Set(
  onlyArg
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);
const want = (part: string) => only.size === 0 || only.has(part);

const url = (path: string) => pathToFileURL(path).href;
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------------------------------------------------------------------------------------------------------------
// Logos: each mark from platforms.ts on a small dark tile, so one file reads on GitHub's light and dark themes.

const LOGOS: PlatformLogoName[] = [
  'android',
  'apple',
  'chrome',
  'safari',
  'windows',
  'telegram',
  'claude',
  'anthropic',
  'supabase',
  'postgresql',
  'expo',
  'react',
  'github',
  'netlify',
  'pdf',
  'xlsx',
  'onec',
  'googlePlay',
  'youtube',
];

function logoInner(logo: PlatformLogo): string {
  const main = logo.paths.map((d) => `<path fill="${logo.onDark}" d="${d}"/>`).join('');
  const detail = logo.detail
    ? logo.detail.paths.map((d) => `<path fill="${logo.detail!.color}" d="${d}"/>`).join('')
    : '';
  const label = logo.label
    ? `<text x="12" y="16.2" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="10" fill="${logo.label.color}">${esc(logo.label.text)}</text>`
    : '';
  return main + detail + label;
}

function logoTile(title: string, inner: string): string {
  // 28 × 28 tile, the 24 × 24 mark scaled to 20 and centered.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title><rect width="28" height="28" rx="7" fill="#1C1C1E"/><rect x=".5" y=".5" width="27" height="27" rx="6.5" fill="none" stroke="#FFFFFF" stroke-opacity=".08"/><g transform="translate(4 4) scale(.8333)">${inner}</g></svg>\n`;
}

const rotaMarkSvg = readFileSync(
  join(repo, 'packages/design/assets/logo/rota-mark-red.svg'),
  'utf8',
);
const rotaMarkInner = (rotaMarkSvg.match(/<svg[^>]*>([\s\S]*)<\/svg>/)?.[1] ?? '').replace(
  /<title>[\s\S]*?<\/title>/,
  '',
);
const rotaMarkBox = rotaMarkSvg.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 50 50';

function writeLogos(): void {
  const dir = join(out, 'logos');
  mkdirSync(dir, { recursive: true });
  for (const name of LOGOS) {
    const logo: PlatformLogo = platformLogos[name];
    writeFileSync(join(dir, `${name}.svg`), logoTile(logo.title, logoInner(logo)));
  }
  const [, , bw, bh] = rotaMarkBox.split(/\s+/).map(Number);
  const s = 20 / Math.max(bw ?? 50, bh ?? 50);
  writeFileSync(
    join(dir, 'rota.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28" role="img" aria-label="Rota"><title>Rota</title><rect width="28" height="28" rx="7" fill="#000"/><rect x=".5" y=".5" width="27" height="27" rx="6.5" fill="none" stroke="#FFFFFF" stroke-opacity=".12"/><g transform="translate(4 4) scale(${s.toFixed(4)})">${rotaMarkInner}</g></svg>\n`,
  );
  console.log(`logos   ${LOGOS.length + 1} files in docs/readme/logos`);
}

// ---------------------------------------------------------------------------------------------------------------
// Badges: dark pills with a mono label and a value; widths from monospace metrics, pinned with textLength.

interface Badge {
  file: string;
  label: string;
  value: string;
  logo?: PlatformLogoName | 'rota';
  tone?: 'red' | 'dark' | 'green';
}

const BADGES: Badge[] = [
  {
    file: 'hackathon',
    label: 'Qostanai Industry Hackathon',
    value: '2026 · Кейс 1 «НарядAI»',
    logo: 'rota',
    tone: 'red',
  },
  { file: 'android', label: 'Android', value: 'APK', logo: 'android', tone: 'dark' },
  { file: 'web', label: 'Web', value: 'panel + PWA', logo: 'chrome', tone: 'dark' },
  { file: 'golden', label: 'AI check', value: '10 из 10 golden', logo: 'claude', tone: 'green' },
  { file: 'tests', label: 'Tests', value: '660 passing', tone: 'green' },
  {
    file: 'supabase',
    label: 'Supabase',
    value: 'Postgres 17 · Realtime',
    logo: 'supabase',
    tone: 'dark',
  },
  { file: 'expo', label: 'Expo', value: 'SDK 57 · RN 0.86', logo: 'expo', tone: 'dark' },
];

function badgeSvg(b: Badge): string {
  const char = 6.62; // 11 px monospace advance
  const h = 28;
  const logoW = b.logo ? 22 : 0;
  const label = b.label.toUpperCase();
  const labelW = Math.round(label.length * char);
  const valueW = Math.round(b.value.length * char);
  const left = 12 + logoW + labelW + 10;
  const right = 12 + valueW + 12;
  const w = left + right;
  const fill = b.tone === 'red' ? '#FF3B30' : b.tone === 'green' ? '#1F6F43' : '#2C2C2E';
  let logo = '';
  if (b.logo === 'rota') {
    const [, , bw, bh] = rotaMarkBox.split(/\s+/).map(Number);
    const s = 16 / Math.max(bw ?? 50, bh ?? 50);
    logo = `<g transform="translate(10 6) scale(${s.toFixed(4)})">${rotaMarkInner}</g>`;
  } else if (b.logo) {
    logo = `<g transform="translate(10 6) scale(.6667)">${logoInner(platformLogos[b.logo])}</g>`;
  }
  const font = `font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, 'DejaVu Sans Mono', monospace" font-size="11"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(`${b.label}: ${b.value}`)}"><title>${esc(`${b.label}: ${b.value}`)}</title>
<clipPath id="r"><rect width="${w}" height="${h}" rx="7"/></clipPath>
<g clip-path="url(#r)"><rect width="${w}" height="${h}" fill="#161617"/><rect x="${left}" width="${right}" height="${h}" fill="${fill}"/></g>
<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="6.5" fill="none" stroke="#FFFFFF" stroke-opacity=".1"/>
${logo}
<text x="${12 + logoW}" y="18" ${font} fill="#AEAEB2" textLength="${labelW}" lengthAdjust="spacingAndGlyphs">${esc(label)}</text>
<text x="${left + 12}" y="18" ${font} font-weight="700" fill="#FFFFFF" textLength="${valueW}" lengthAdjust="spacingAndGlyphs">${esc(b.value)}</text>
</svg>\n`;
}

function writeBadges(): void {
  const dir = join(out, 'badges');
  mkdirSync(dir, { recursive: true });
  for (const b of BADGES) writeFileSync(join(dir, `${b.file}.svg`), badgeSvg(b));
  console.log(`badges  ${BADGES.length} files in docs/readme/badges`);
}

// ---------------------------------------------------------------------------------------------------------------
// HTML rendering through headless Chrome.

function fontFaces(): string {
  const files = [
    ['inter', ['400', '500', '600', '700', '800']],
    ['geist-mono', ['400', '500']],
  ] as const;
  let css = '';
  for (const [pkg, weights] of files) {
    const dir = join(repo, 'node_modules/@fontsource', pkg);
    for (const w of weights) {
      css += readFileSync(join(dir, `${w}.css`), 'utf8').replaceAll(
        'url(./files/',
        `url(${url(join(dir, 'files'))}/`,
      );
    }
  }
  return css;
}

const BASE_CSS = `
${fontFaces()}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:transparent;-webkit-font-smoothing:antialiased}
body{font-family:Inter,system-ui,sans-serif;color:#fff}
.mono{font-family:'Geist Mono',ui-monospace,monospace}
`;

async function render(html: string, w: number, h: number, file: string, scale = 2): Promise<void> {
  const tmp = mkdtempSync(join(tmpdir(), 'rota-readme-'));
  const page = join(tmp, 'page.html');
  const png = join(tmp, 'shot.png');
  writeFileSync(
    page,
    `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}</style></head><body>${html}</body></html>`,
  );
  const flags = [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    `--force-device-scale-factor=${scale}`,
    `--window-size=${w},${h}`,
    '--default-background-color=00000000',
    '--virtual-time-budget=4000',
    '--allow-file-access-from-files',
    `--screenshot=${png}`,
    url(page),
  ];
  // Headless Chrome sometimes keeps running after it wrote the screenshot, so wait for the file, not for the exit.
  const shoot = (): Promise<boolean> =>
    new Promise((done) => {
      const proc = spawn(chrome, flags, { stdio: 'ignore' });
      const started = Date.now();
      const timer = setInterval(() => {
        const ready =
          existsSync(png) && statSync(png).size > 0 && Date.now() - statSync(png).mtimeMs > 300;
        if (ready || Date.now() - started > 30_000) {
          clearInterval(timer);
          proc.kill('SIGKILL');
          done(ready);
        }
      }, 200);
      proc.on('exit', () => {
        if (existsSync(png)) return;
        clearInterval(timer);
        done(false);
      });
    });
  for (let attempt = 1; !(await shoot()); attempt++) {
    if (attempt >= 3) throw new Error(`Chrome wrote no screenshot for ${file}`);
    console.log(`retry   ${file.replace(`${repo}/`, '')} (attempt ${attempt + 1})`);
  }
  mkdirSync(resolve(file, '..'), { recursive: true });
  const info = await sharp(png)
    .png({ palette: true, quality: 92, effort: 10, compressionLevel: 9 })
    .toFile(file);
  rmSync(tmp, { recursive: true, force: true });
  console.log(
    `png     ${file.replace(`${repo}/`, '')}  ${info.width}×${info.height}  ${Math.round(info.size / 1024)} KB`,
  );
}

// ---------------------------------------------------------------------------------------------------------------
// The phone frame: a titanium edge, a black bezel, the island, side buttons. Screens from the iOS Simulator carry
// their own status bar; screens from the browser app (pwa/) get a status band in the screen's own top color.

interface Shot {
  src: string; // relative to docs/screenshots/presentation
  time?: string; // status band time for browser shots
}

interface ShotInfo {
  path: string;
  w: number;
  h: number;
  band: string | null; // band color for browser shots
  time: string;
}

async function shotInfo(s: Shot): Promise<ShotInfo> {
  const path = join(shots, s.src);
  const meta = await sharp(path).metadata();
  let band: string | null = null;
  if (s.src.startsWith('pwa/')) {
    const { data } = await sharp(path)
      .extract({ left: 6, top: 6, width: 1, height: 1 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    band = `rgb(${data[0]} ${data[1]} ${data[2]})`;
  }
  return { path, w: meta.width ?? 1170, h: meta.height ?? 2532, band, time: s.time ?? '05:09' };
}

const PHONE_CSS = `
.phone{position:relative;border-radius:calc(var(--w)*.17);padding:calc(var(--w)*.012);
  background:linear-gradient(140deg,#5a5a5e 0%,#1d1d1f 18%,#0b0b0c 50%,#232325 82%,#5a5a5e 100%);
  box-shadow:0 calc(var(--w)*.12) calc(var(--w)*.22) calc(var(--w)*-.04) rgb(0 0 0/.75),0 0 0 1px rgb(255 255 255/.07)}
.phone .bezel{border-radius:calc(var(--w)*.158);padding:calc(var(--w)*.026);background:#030303}
.phone .screen{position:relative;border-radius:calc(var(--w)*.13);overflow:hidden;background:#000}
.phone .screen img{display:block;width:100%}
.phone .band{position:relative;height:calc(var(--w)*.115);display:flex;align-items:center;justify-content:space-between;
  padding:calc(var(--w)*.02) calc(var(--w)*.085) 0;font-weight:600;font-size:calc(var(--w)*.042);color:#fff;letter-spacing:-.01em}
.phone .bat{width:calc(var(--w)*.07);height:calc(var(--w)*.034);border-radius:calc(var(--w)*.01);background:#fff;opacity:.95;position:relative}
.phone .bat:after{content:'';position:absolute;right:calc(var(--w)*-.012);top:30%;height:40%;width:calc(var(--w)*.007);border-radius:2px;background:#fff;opacity:.6}
.phone .island{position:absolute;left:50%;top:calc(var(--w)*.024);transform:translateX(-50%);width:calc(var(--w)*.3);
  height:calc(var(--w)*.083);border-radius:999px;background:#000;z-index:3}
.phone .glare{position:absolute;inset:0;z-index:2;pointer-events:none;
  background:linear-gradient(115deg,rgb(255 255 255/.07) 0%,rgb(255 255 255/0) 32%)}
.phone .btn{position:absolute;width:calc(var(--w)*.012);border-radius:2px;background:linear-gradient(90deg,#2a2a2c,#6a6a6e,#2a2a2c)}
.phone .b1{left:calc(var(--w)*-.009);top:18%;height:5%}
.phone .b2{left:calc(var(--w)*-.009);top:26%;height:9%}
.phone .b3{left:calc(var(--w)*-.009);top:37%;height:9%}
.phone .b4{right:calc(var(--w)*-.009);top:29%;height:13%}
`;

function phoneHtml(info: ShotInfo, w: number, style = ''): string {
  const band = info.band
    ? `<div class="band" style="background:${info.band}"><span>${info.time}</span><span class="bat"></span></div>`
    : '';
  return `<div class="phone" style="--w:${w}px;width:${w}px;${style}">
  <i class="btn b1"></i><i class="btn b2"></i><i class="btn b3"></i><i class="btn b4"></i>
  <div class="bezel"><div class="screen"><div class="island"></div>${band}<img src="${url(info.path)}"><div class="glare"></div></div></div></div>`;
}

/** Outer height of a phone of width w around a shot. */
function phoneHeight(info: ShotInfo, w: number): number {
  const inner = w - 2 * w * 0.012 - 2 * w * 0.026;
  const band = info.band ? w * 0.115 : 0;
  return inner * (info.h / info.w) + band + 2 * w * 0.012 + 2 * w * 0.026;
}

// ---------------------------------------------------------------------------------------------------------------
// Shared backgrounds.

const SILK = `<svg class="silk" viewBox="0 0 1200 500" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="s" x1="0" x2="1"><stop offset="0" stop-color="#ff3b30" stop-opacity="0"/><stop offset=".55" stop-color="#ff3b30" stop-opacity=".55"/><stop offset="1" stop-color="#ff6555" stop-opacity=".15"/></linearGradient></defs>
${Array.from({ length: 9 }, (_, i) => {
  const y = 330 + i * 16;
  return `<path d="M -40 ${y + 120} C 300 ${y + 40}, 520 ${y - 220 + i * 9}, 760 ${y - 120} S 1120 ${y - 300 + i * 14}, 1260 ${y - 260}" fill="none" stroke="url(#s)" stroke-width="${(1.4 - i * 0.1).toFixed(2)}" opacity="${(0.75 - i * 0.06).toFixed(2)}"/>`;
}).join('\n')}
</svg>`;

const lockupWhite = readFileSync(
  join(repo, 'packages/design/assets/logo/rota-lockup-white.svg'),
  'utf8',
);

// ---------------------------------------------------------------------------------------------------------------
// Banner: 1200 × 500 at 2×.

async function writeBanner(): Promise<void> {
  const left = await shotInfo({ src: 'mobile/02-master-shift.png' });
  const mid = await shotInfo({ src: 'pwa/06-B-emergency-red-screen.png', time: '05:09' });
  const right = await shotInfo({ src: 'pwa/19-A-ai-report.png', time: '05:12' });
  const logos: PlatformLogoName[] = [
    'android',
    'apple',
    'chrome',
    'telegram',
    'claude',
    'supabase',
  ];
  const logoRow = logos
    .map((n) => {
      const l = platformLogos[n];
      return `<span class="lg"><svg viewBox="0 0 24 24" width="16" height="16">${logoInner(l)}</svg>${esc(n === 'apple' ? 'iOS' : n === 'chrome' ? 'Web' : l.title)}</span>`;
    })
    .join('');
  const html = `<style>${PHONE_CSS}
.card{position:relative;width:1200px;height:500px;border-radius:28px;overflow:hidden;background:#000;
  box-shadow:inset 0 0 0 1px rgb(255 255 255/.09)}
.glow{position:absolute;inset:0;background:
  radial-gradient(520px 420px at 76% 64%,rgb(255 59 48/.55),rgb(255 59 48/0) 70%),
  radial-gradient(620px 320px at 92% 112%,rgb(195 16 8/.85),rgb(195 16 8/0) 70%),
  radial-gradient(420px 260px at 2% -6%,rgb(255 59 48/.16),rgb(255 59 48/0) 70%)}
.silk{position:absolute;inset:0;width:100%;height:100%}
.grain{position:absolute;inset:0;background:radial-gradient(1200px 500px at 30% 40%,rgb(0 0 0/0),rgb(0 0 0/.55))}
.copy{position:absolute;left:64px;top:50px;width:600px}
.lockup svg{height:32px;width:auto;display:block}
.eyebrow{margin-top:28px;font-size:12px;letter-spacing:.12em;color:#ff6555;text-transform:uppercase}
h1{margin-top:14px;font-size:62px;line-height:.98;font-weight:800;letter-spacing:-.045em}
.lead{margin-top:18px;font-size:16px;line-height:1.45;color:#aeaeb2;width:470px}
.pills{margin-top:22px;display:flex;gap:8px;white-space:nowrap}
.pill{display:flex;align-items:center;gap:7px;padding:7px 12px 7px 11px;border-radius:999px;font-size:12px;font-weight:500;color:#fff;
  background:rgb(41 41 43/.55);box-shadow:inset 0 0 0 1px rgb(255 255 255/.14)}
.pill b{font-family:'Geist Mono',monospace;font-weight:500;color:#ff9d8e}
.dot{width:6px;height:6px;border-radius:50%;background:#ff3b30;box-shadow:0 0 8px #ff3b30}
.logos{position:absolute;left:64px;bottom:30px;display:flex;gap:18px;font-size:12.5px;color:#8e8e93}
.lg{display:flex;align-items:center;gap:7px}
.phones{position:absolute;inset:0}
.hud{position:absolute;left:770px;top:38px;z-index:9;display:flex;align-items:center;gap:9px;padding:8px 14px 8px 10px;border-radius:999px;
  font-size:13px;font-weight:500;background:rgb(31 31 33/.72);box-shadow:inset 0 0 0 1px rgb(255 255 255/.16),0 12px 30px rgb(0 0 0/.5);backdrop-filter:blur(10px)}
.hud .m{width:18px;height:18px}
.hud b{font-family:'Geist Mono',monospace;font-weight:500;color:#aeaeb2}
</style>
<div class="card"><div class="glow"></div>${SILK}<div class="grain"></div>
<div class="phones">
  ${phoneHtml(left, 200, 'position:absolute;left:712px;top:132px;transform:rotate(-7deg);z-index:1;filter:brightness(.82)')}
  ${phoneHtml(right, 200, 'position:absolute;left:996px;top:132px;transform:rotate(7deg);z-index:1;filter:brightness(.82)')}
  ${phoneHtml(mid, 226, 'position:absolute;left:842px;top:78px;z-index:2')}
  <div class="hud"><svg class="m" viewBox="${rotaMarkBox}">${rotaMarkInner}</svg>ИИ проверил №661 <b>· 87 из 100</b></div>
</div>
<div class="copy">
  <div class="lockup">${lockupWhite}</div>
  <div class="eyebrow mono">Qostanai Industry Hackathon 2026 · Кейс 1 «НарядAI»</div>
  <h1>Наряд выдан,<br>ИИ на контроле.</h1>
  <div class="lead">Мастер выдаёт наряд с телефона, исполнитель принимает его в один тап, а ИИ следит за сроками, проверяет работу по фото и находит слабые места оборудования.</div>
  <div class="pills">
    <span class="pill"><i class="dot"></i><b>1,9 с</b> до красного экрана</span>
    <span class="pill"><i class="dot"></i><b>10 из 10</b> вердиктов ИИ</span>
    <span class="pill"><i class="dot"></i><b>6 из 6</b> закономерностей</span>
  </div>
</div>
<div class="logos">${logoRow}</div>
</div>`;
  await render(html, 1200, 500, join(out, 'banner.png'));
}

// ---------------------------------------------------------------------------------------------------------------
// The order loop in six phones: 1200 × 560 at 2×.

const LOOP: { shot: Shot; step: string; title: string; text: string }[] = [
  {
    shot: { src: 'mobile/08-master-create-ai-suggestion.png' },
    step: '01',
    title: 'Master issues',
    text: 'Preset, unit, problem, «Выдать». AI preselects the worker.',
  },
  {
    shot: { src: 'pwa/06-B-emergency-red-screen.png', time: '05:09' },
    step: '02',
    title: 'Red screen',
    text: 'Siren and a full screen alert until the worker answers.',
  },
  {
    shot: { src: 'pwa/12-B-order-in-progress.png', time: '05:10' },
    step: '03',
    title: 'In progress',
    text: '«Принять», «Начать исполнение»: the master sees it live.',
  },
  {
    shot: { src: 'pwa/15-B-close-after-photo.png', time: '05:11' },
    step: '04',
    title: 'Close with photo',
    text: 'Works, fault code, materials against the norm, the after photo.',
  },
  {
    shot: { src: 'pwa/17-B-ai-verdict.png', time: '05:12' },
    step: '05',
    title: 'AI check',
    text: 'Rules plus Claude Sonnet 5.5 on the photos: 87 из 100.',
  },
  {
    shot: { src: 'pwa/19-A-ai-report.png', time: '05:12' },
    step: '06',
    title: 'Master decides',
    text: 'Full report, then «Согласен, закрыть» in one tap.',
  },
];

async function writeLoop(): Promise<void> {
  const infos = await Promise.all(LOOP.map((s) => shotInfo(s.shot)));
  const w = 156;
  const ph = Math.max(...infos.map((i) => phoneHeight(i, w)));
  const H = Math.ceil(ph + 186);
  const cells = LOOP.map(
    (s, i) => `<div class="cell">
    <div class="head"><span class="n mono">${s.step}</span><span class="t">${esc(s.title)}</span></div>
    <div class="ph" style="height:${Math.ceil(ph)}px">${phoneHtml(infos[i]!, w)}</div>
    <div class="x">${esc(s.text)}</div></div>`,
  ).join('<div class="arrow mono">→</div>');
  const html = `<style>${PHONE_CSS}
.card{position:relative;width:1200px;height:${H}px;border-radius:28px;overflow:hidden;background:#000;box-shadow:inset 0 0 0 1px rgb(255 255 255/.09)}
.glow{position:absolute;inset:0;background:radial-gradient(700px 300px at 50% 105%,rgb(255 59 48/.38),rgb(255 59 48/0) 70%),radial-gradient(400px 200px at 0% 0%,rgb(255 59 48/.12),rgb(255 59 48/0) 70%)}
.row{position:absolute;left:0;right:0;top:34px;display:flex;justify-content:center;align-items:flex-start;gap:6px}
.cell{width:${w + 6}px;display:flex;flex-direction:column;align-items:center}
.head{height:44px;display:flex;flex-direction:column;align-items:center;gap:3px}
.n{font-size:11px;letter-spacing:.14em;color:#ff6555}
.t{font-size:15px;font-weight:700;letter-spacing:-.01em}
.ph{display:flex;align-items:flex-start;justify-content:center}
.x{margin-top:22px;width:${w + 8}px;text-align:center;font-size:12.5px;line-height:1.4;color:#aeaeb2}
.arrow{margin-top:${Math.round(44 + ph / 2 - 10)}px;color:#ff3b30;font-size:18px;width:20px;text-align:center}
</style><div class="card"><div class="glow"></div><div class="row">${cells}</div></div>`;
  await render(html, 1200, H, join(out, 'loop.png'));
}

// ---------------------------------------------------------------------------------------------------------------
// Number cards: 260 × 150 at 2×. Every number is measured; the README links each card to its source file. The two
// live loop cards are the film's take (docs/live-loop-timings.md); the history card counts history orders only (the
// database also holds the 19 orders of the Demo Day start state).

const STATS: { file: string; eyebrow: string; value: string; unit?: string; label: string }[] = [
  {
    file: 'issue-to-red',
    eyebrow: 'Live loop',
    value: '0.72',
    unit: 's',
    label: '«Выдать» to the red screen, Release build on two simulators',
  },
  {
    file: 'ai-verdict',
    eyebrow: 'Live loop',
    value: '8.49',
    unit: 's',
    label: 'from sending the report to Claude’s verdict on the worker’s phone',
  },
  {
    file: 'golden',
    eyebrow: 'AI check',
    value: '10/10',
    label: 'golden set verdicts right with Claude Sonnet 5.5',
  },
  {
    file: 'patterns',
    eyebrow: 'Analytics',
    value: '22/22',
    label: 'planted anomaly measures found within ±20 %',
  },
  {
    file: 'invented',
    eyebrow: 'Analytics',
    value: '0',
    label: 'invented numbers in 4 live AI analytics answers',
  },
  {
    file: 'shift-report',
    eyebrow: 'Reports',
    value: '5/5',
    label: 'shift report windows equal to a manual SQL count',
  },
  {
    file: 'history',
    eyebrow: 'Data',
    value: '540',
    label: 'history orders over 92 days, 6 planted patterns',
  },
  {
    file: 'tests',
    eyebrow: 'Engineering',
    value: '660',
    label: 'automated tests pass, plus 7 of 7 live contract scenarios',
  },
  {
    file: 'cost',
    eyebrow: 'Cost',
    value: '0.016',
    unit: 'USD',
    label: 'mean cost of one check in the live golden run on Sonnet 5.5',
  },
];

async function writeStats(): Promise<void> {
  for (const s of STATS) {
    const html = `<style>
.c{position:relative;width:260px;height:150px;border-radius:18px;overflow:hidden;background:#0a0a0a;
  box-shadow:inset 0 0 0 1px rgb(255 255 255/.1);padding:18px 20px}
.c:before{content:'';position:absolute;inset:0;background:radial-gradient(220px 140px at 100% 0%,rgb(255 59 48/.30),rgb(255 59 48/0) 70%)}
.e{position:relative;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#ff6555}
.v{position:relative;margin-top:8px;font-size:46px;line-height:1;font-weight:800;letter-spacing:-.04em}
.v small{font-size:22px;font-weight:700;letter-spacing:-.01em;color:#ff9d8e;margin-left:4px}
.l{position:relative;margin-top:10px;font-size:13px;line-height:1.38;color:#aeaeb2}
</style><div class="c"><div class="e mono">${esc(s.eyebrow)}</div><div class="v">${esc(s.value)}${s.unit ? `<small>${esc(s.unit)}</small>` : ''}</div><div class="l">${esc(s.label)}</div></div>`;
    await render(html, 260, 150, join(out, 'stats', `${s.file}.png`));
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Gallery: phones (300 wide) and browser windows (720 wide), both at 2×.

const PHONES: { file: string; shot: Shot }[] = [
  { file: 'm-shift', shot: { src: 'mobile/02-master-shift.png' } },
  { file: 'm-board', shot: { src: 'mobile/03-master-board.png' } },
  { file: 'm-ai-report', shot: { src: 'mobile/28-master-ai-report-sonnet.png' } },
  { file: 'm-overuse', shot: { src: 'mobile/20-worker-close-overuse.png' } },
  { file: 'm-rework', shot: { src: 'mobile/23-master-rework-reasons.png' } },
  { file: 'm-rating', shot: { src: 'mobile/24-worker-rating.png' } },
];

const WINDOWS: { file: string; src: string; path: string; top?: number }[] = [
  { file: 'w-shift-report', src: 'web-live/w04-shift-report.png', path: '/reports/shift' },
  { file: 'w-rating', src: 'web-live/w05-rating.png', path: '/reports/rating' },
  // The cards of the earlier capture; its ask box line predates the live ask box, so the crop starts at «Выводы».
  { file: 'w-analytics', src: 'web/w06-analytics.png', path: '/analytics', top: 732 },
  { file: 'w-dashboard', src: 'web-live/w11-dashboard.png', path: '/dashboard' },
  { file: 'w-what-ai-sees', src: 'web-live/w14-admin-what-ai-sees.png', path: '/admin/ai' },
  { file: 'w-equipment', src: 'web-live/w07-equipment-k3.png', path: '/equipment/13' },
];

async function writeScreens(): Promise<void> {
  const dir = join(out, 'screens');
  for (const p of PHONES) {
    const info = await shotInfo(p.shot);
    const w = 300;
    const h = Math.ceil(phoneHeight(info, w));
    const html = `<style>${PHONE_CSS} .wrap{padding:18px 24px 40px} .phone{box-shadow:0 14px 26px -8px rgb(0 0 0/.42),0 0 0 1px rgb(255 255 255/.07)}</style><div class="wrap">${phoneHtml(info, w)}</div>`;
    await render(html, w + 48, h + 58, join(dir, `${p.file}.png`));
  }
  const tmp = mkdtempSync(join(tmpdir(), 'rota-crop-'));
  for (const win of WINDOWS) {
    // One viewport of the 2× capture, 1440 × 900 CSS px, from the top unless the entry says otherwise.
    const crop = join(tmp, `${win.file}.png`);
    const cropped = sharp(join(shots, win.src)).extract({
      left: 0,
      top: win.top ?? 0,
      width: 2880,
      height: 1800,
    });
    if (win.top) {
      // A crop below the top cuts the selected sidebar item; blank its sliver (sidebar 272 CSS px, black).
      const sliver = await sharp({
        create: { width: 538, height: 28, channels: 4, background: '#000000' },
      })
        .png()
        .toBuffer();
      cropped.composite([{ input: sliver, left: 0, top: 0 }]);
    }
    await cropped.png().toFile(crop);
    const W = 720;
    const html = `<style>
.wrap{padding:20px 20px 44px}
.win{width:${W}px;border-radius:14px;overflow:hidden;background:#1c1c1e;
  box-shadow:0 16px 30px -10px rgb(0 0 0/.45),0 0 0 1px rgb(255 255 255/.1)}
.bar{height:36px;display:flex;align-items:center;gap:7px;padding:0 14px;background:#161617;border-bottom:1px solid #2c2c2e;position:relative}
.bar i{width:11px;height:11px;border-radius:50%}
.url{position:absolute;left:50%;top:7px;transform:translateX(-50%);height:22px;padding:0 14px;border-radius:7px;background:#2c2c2e;
  display:flex;align-items:center;gap:7px;font-size:11.5px;color:#aeaeb2;white-space:nowrap}
.url b{color:#fff;font-weight:500}
.url .m{width:12px;height:12px}
.win img{display:block;width:100%}
</style><div class="wrap"><div class="win"><div class="bar"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i>
<div class="url mono"><svg class="m" viewBox="${rotaMarkBox}">${rotaMarkInner}</svg><span>rota-naryad.netlify.app<b>${esc(win.path)}</b></span></div></div>
<img src="${url(crop)}"></div></div>`;
    await render(html, W + 40, 36 + 450 + 64, join(dir, `${win.file}.png`));
  }
  rmSync(tmp, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------------------------------------------
// Architecture: 1200 × 724 at 2×. The same parts and calls as docs/architecture.md, drawn in the Rota style with the
// real marks; every box and arrow is a part or a call that exists in apps/, packages/shared or supabase/.

const mark = (name: PlatformLogoName, size = 18): string =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}">${logoInner(platformLogos[name])}</svg>`;
const rotaMark = (size = 18): string =>
  `<svg viewBox="${rotaMarkBox}" width="${size}" height="${size}">${rotaMarkInner}</svg>`;
const shieldMascot = readFileSync(
  join(repo, 'packages/design/assets/mascots/dark/shield.svg'),
  'utf8',
);

async function writeArchitecture(): Promise<void> {
  const node = (
    x: number,
    y: number,
    w: number,
    h: number,
    title: string,
    text: string,
    icons = '',
    cls = '',
  ) =>
    `<div class="node ${cls}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"><h4>${icons}<span>${title}</span></h4><p>${text}</p></div>`;
  const fns: [string, string][] = [
    ['ai-verify', 'rules, then one Sonnet call'],
    ['ai-insights', 'Haiku reads, Sonnet writes'],
    ['ai-shift-summary', 'Sonnet, from the report'],
    ['ai-explain-rating', 'Haiku, three sentences'],
    ['notify-dispatch', 'push and Telegram'],
    ['telegram-webhook', 'links a chat by token'],
  ];
  const fnRows = fns
    .map(
      ([n, t], i) =>
        `<div class="fn" style="top:${44 + i * 44}px"><b class="mono">${n}</b><span>${t}</span></div>`,
    )
    .join('');
  const chips = [
    'state machine',
    'RLS by role',
    'rules R1 to R4',
    'detectors',
    'Vault',
    'integration_outbox',
  ]
    .map((c) => `<span class="chip mono">${c}</span>`)
    .join('');
  const arrow = (d: string, both = false) =>
    `<path d="${d}" fill="none" stroke="rgb(255 255 255/.38)" stroke-width="1.4" marker-end="url(#a)"${both ? ' marker-start="url(#as)"' : ''}/>`;
  const red = (d: string) =>
    `<path d="${d}" fill="none" stroke="#ff3b30" stroke-width="1.6" stroke-dasharray="4 3" marker-end="url(#ar)"/>`;
  const html = `<style>
.card{position:relative;width:1200px;height:724px;border-radius:28px;overflow:hidden;background:#000;box-shadow:inset 0 0 0 1px rgb(255 255 255/.09)}
.glow{position:absolute;inset:0;background:radial-gradient(520px 300px at 100% 0%,rgb(255 59 48/.22),rgb(255 59 48/0) 70%),
  radial-gradient(600px 260px at 50% 112%,rgb(255 59 48/.2),rgb(255 59 48/0) 70%)}
.eyebrow{position:absolute;left:48px;top:34px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#ff6555}
h2{position:absolute;left:48px;top:54px;font-size:30px;font-weight:800;letter-spacing:-.03em}
.lbl{position:absolute;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#8e8e93}
.node{position:absolute;border-radius:14px;background:rgb(28 28 30/.94);box-shadow:inset 0 0 0 1px rgb(255 255 255/.1);padding:12px 14px}
.node h4{display:flex;align-items:center;gap:8px;font-size:14.5px;font-weight:700;letter-spacing:-.01em}
.node h4 svg{flex:none}
.node p{margin-top:6px;font-size:11.5px;line-height:1.42;color:#aeaeb2}
.node.red{box-shadow:inset 0 0 0 1px rgb(255 59 48/.6);background:linear-gradient(135deg,rgb(255 59 48/.16),rgb(28 28 30/.94) 60%)}
.panel{position:absolute;left:350px;top:128px;width:500px;height:500px;border-radius:20px;background:rgb(255 255 255/.025);
  box-shadow:inset 0 0 0 1px rgb(62 207 142/.35)}
.panel .hd{position:absolute;left:18px;right:18px;top:14px;display:flex;align-items:center;justify-content:space-between}
.panel .hd b{display:flex;align-items:center;gap:8px;font-size:17px;font-weight:700}
.panel .hd span{display:flex;align-items:center;gap:7px;font-size:12px;color:#aeaeb2}
.fns{padding:12px 14px}
.fn{position:absolute;left:14px;right:14px;height:36px;border-radius:9px;background:rgb(255 255 255/.04);display:flex;flex-direction:column;justify-content:center;padding:0 10px}
.fn b{font-size:12px;font-weight:500;color:#fff}
.fn span{font-size:10.5px;color:#8e8e93;margin-top:1px}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.chip{font-size:10.5px;padding:3px 8px;border-radius:999px;background:rgb(255 255 255/.06);color:#d1d1d6}
.legend{position:absolute;left:48px;top:484px;width:262px;font-size:11.5px;line-height:1.5;color:#8e8e93}
.legend b{color:#d1d1d6;font-weight:600}
.foot{position:absolute;left:48px;right:48px;top:640px;display:flex;gap:24px}
.foot div{flex:1;border-radius:14px;padding:12px 14px;background:rgb(255 255 255/.03);box-shadow:inset 0 0 0 1px rgb(255 255 255/.08)}
.foot h5{display:flex;align-items:center;gap:7px;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#ff6555;font-weight:500}
.foot p{margin-top:5px;font-size:11.5px;line-height:1.4;color:#aeaeb2}
.mascot svg{width:26px;height:26px;display:block}
svg.wires{position:absolute;inset:0;width:1200px;height:724px;pointer-events:none}
</style>
<div class="card"><div class="glow"></div>
<div class="eyebrow mono">Architecture</div>
<h2>One source of truth: Postgres</h2>
<div class="lbl mono" style="left:48px;top:130px">Clients</div>
${node(48, 150, 262, 96, 'Android app', 'Expo SDK 57 APK for мастер, исполнитель and руководитель: siren screen, camera, photo pipeline', mark('android') + mark('expo'))}
${node(48, 260, 262, 96, 'Phone app in the browser', 'the same Expo code at <span class="mono">/app/</span>, on an iPhone or a laptop', mark('safari') + mark('chrome'))}
${node(48, 370, 262, 96, 'Web panel', 'Vite and React: shift, reports with PDF and Excel, rating, AI analytics, admin', mark('react'))}
<div class="legend">Every client talks to Supabase with <b>supabase-js</b>: the publishable key plus the user's JWT, <b>one Realtime channel</b> per user, photos at most 1600 px with sha256 and dHash <b>straight to Storage</b>.</div>
<div class="panel"><div class="hd"><b>${mark('supabase', 20)}Supabase</b><span class="mono">${mark('postgresql', 16)}Postgres 17</span></div></div>
${node(368, 176, 230, 80, 'PostgREST RPC', '<span class="mono">create_order</span>, <span class="mono">order_action</span>, suggest_assignees, reports, rating')}
${node(368, 266, 230, 80, 'Realtime', 'orders, notifications, ai_reviews, employees: status on every screen')}
${node(368, 356, 230, 64, 'Storage', 'private bucket <span class="mono">photos</span>, signed URLs')}
${node(368, 430, 230, 80, 'pg_cron and pg_net', 'watchdog every 5 s, AI check retry, Monday digest')}
<div class="node fns" style="left:610px;top:176px;width:222px;height:334px"><h4>Edge Functions · Deno</h4>${fnRows}</div>
<div class="node" style="left:368px;top:522px;width:464px;height:92px"><h4>${mark('postgresql', 18)}<span>Postgres 17</span></h4><div class="chips">${chips}</div></div>
<div class="lbl mono" style="left:884px;top:130px">Outside the database</div>
${node(884, 150, 268, 84, 'Privacy gateway', 'names, табельные номера, phones → E01…E15, M01, R01; logged in llm_audit', `<span class="mascot">${shieldMascot}</span>`, 'red')}
${node(884, 246, 268, 84, 'Claude Sonnet · Haiku', '5.5 models through one fetch client, or a local model: <span class="mono">openai_compatible</span>', mark('claude'))}
${node(884, 342, 268, 84, 'Expo push → FCM', 'channels orders, emergency with the siren, reminders', mark('expo') + mark('android'))}
${node(884, 438, 268, 84, 'Telegram bot', 'number, unit, area, status, deadline; never a name', mark('telegram'))}
${node(884, 534, 268, 84, '1С:ТОиР', '<span class="mono">order.created</span>, <span class="mono">order.closed</span> with materials', mark('onec'))}
<svg class="wires" viewBox="0 0 1200 724"><defs>
<marker id="a" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" fill="rgb(255 255 255/.55)"/></marker>
<marker id="as" viewBox="0 0 8 8" refX="1" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M8 0L0 4L8 8z" fill="rgb(255 255 255/.55)"/></marker>
<marker id="ar" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" fill="#ff3b30"/></marker></defs>
${arrow('M312 198H366', true)}${arrow('M312 308H366', true)}${arrow('M312 418H366', true)}
${arrow('M483 510V520')}${arrow('M721 510V520')}${arrow('M600 470H608')}
${red('M834 238H850M834 282H850M834 326H850M834 370H850M850 370V238H866V192H882')}${arrow('M1018 234V245')}
${arrow('M834 414H866V384H882')}${arrow('M866 414V480H882', true)}
${arrow('M834 570H882')}
</svg>
<div class="foot">
  <div><h5 class="mono">${mark('supabase', 13)}${mark('netlify', 13)}${mark('expo', 13)}Hackathon</h5><p>Supabase Cloud in eu-central-1, the web on Netlify, the APK from EAS. Synthetic people only.</p></div>
  <div><h5 class="mono">${rotaMark(13)}At the plant</h5><p>Self hosted Supabase (open source) on the plant's servers or in a Kazakhstan cloud under Law 94-V.</p></div>
  <div><h5 class="mono">${rotaMark(13)}Guarantees</h5><p>Server clock only, idempotent RPC by <span class="mono">client_action_id</span>, RLS by role, append only <span class="mono">order_events</span>.</p></div>
</div>
</div>`;
  await render(html, 1200, 724, join(out, 'architecture.png'));
}

// ---------------------------------------------------------------------------------------------------------------
// The film poster: four frames of the Remotion film (video/), 1200 × 470 at 2×. The frames come from
//   cd video && npm run stills -- out/poster 2.5 47 90 136 --scale=0.5
// and the part is skipped when they are missing.

const FILM_FRAMES = [
  't002.5s-f0075.png',
  't047.0s-f1410.png',
  't090.0s-f2700.png',
  't136.0s-f4080.png',
];

async function writeFilm(): Promise<void> {
  const dir = join(repo, 'video/out/poster');
  const frames = FILM_FRAMES.map((f) => join(dir, f));
  const missing = frames.filter((f) => !existsSync(f));
  if (missing.length > 0) {
    console.log(
      `skip    film poster: render the frames first (missing ${missing.length} in video/out/poster)`,
    );
    return;
  }
  const scenes = (
    [
      ['0:00', 'Красный экран и сирена'],
      ['0:22', 'Мастер выдаёт наряд'],
      ['0:55', 'Контроль сроков'],
      ['1:17', 'Проверка ИИ и вердикт'],
      ['1:37', 'Доработка: нет фото, перерасход'],
      ['1:50', 'Отчёт смены, рейтинг, аналитика'],
      ['2:17', 'Архитектура и шлюз приватности'],
    ] as [string, string][]
  )
    .map(([t, s]) => `<li><b class="mono">${t}</b>${esc(s)}</li>`)
    .join('');
  const html = `<style>
.card{position:relative;width:1200px;height:470px;border-radius:28px;overflow:hidden;background:#000;box-shadow:inset 0 0 0 1px rgb(255 255 255/.09)}
.glow{position:absolute;inset:0;background:radial-gradient(560px 360px at 78% 50%,rgb(255 59 48/.32),rgb(255 59 48/0) 70%),radial-gradient(380px 240px at 0% 0%,rgb(255 59 48/.14),rgb(255 59 48/0) 70%)}
.copy{position:absolute;left:48px;top:44px;width:380px}
.eyebrow{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#ff6555}
h2{margin-top:12px;font-size:34px;line-height:1.02;font-weight:800;letter-spacing:-.035em}
.sub{margin-top:12px;font-size:13.5px;line-height:1.45;color:#aeaeb2}
ul{list-style:none;margin-top:18px;display:flex;flex-direction:column;gap:7px}
li{display:flex;gap:12px;font-size:13px;color:#d1d1d6}
li b{width:34px;color:#ff9d8e;font-weight:500}
.grid{position:absolute;right:40px;top:40px;display:grid;grid-template-columns:350px 350px;gap:14px}
.f{position:relative;width:350px;height:197px;border-radius:12px;overflow:hidden;box-shadow:0 0 0 1px rgb(255 255 255/.12),0 18px 34px -12px rgb(0 0 0/.8)}
.f img{width:100%;height:100%;object-fit:cover;display:block}
</style><div class="card"><div class="glow"></div>
<div class="copy"><div class="eyebrow mono">Demo film · 2:55 · 1920 × 1080</div><h2>Наряд выдан,<br>ИИ на контроле</h2>
<div class="sub">The Demo Day script in under three minutes: two phones, the AI check, the web panel. Russian captions, every number with its source file.</div>
<ul>${scenes}</ul></div>
<div class="grid">${frames.map((f) => `<div class="f"><img src="${url(f)}"></div>`).join('')}</div>
</div>`;
  await render(html, 1200, 470, join(out, 'film.png'));
}

// ---------------------------------------------------------------------------------------------------------------

mkdirSync(out, { recursive: true });
if (want('logos')) writeLogos();
if (want('badges')) writeBadges();
if (want('banner')) await writeBanner();
if (want('loop')) await writeLoop();
if (want('stats')) await writeStats();
if (want('screens')) await writeScreens();
if (want('arch')) await writeArchitecture();
if (only.has('film')) await writeFilm();
