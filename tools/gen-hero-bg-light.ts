// The light hero background (apps/web/src/landing/assets/hero-light-*), art direction «satin»: a soft white and
// pale silver satin field with broad folds (a height field under a soft key light), and one glossy white satin
// ribbon sweeping down the right edge, its inner edge lacquered signal red: one glossy red edge that softens and fades
// into the white and silver sheet by mid height. The ribbon is an opaque sheet: the mesh from tools/lib/silk.ts (C2 B spline, so no crease
// at the knots) is rasterised with a depth buffer at 4 × 4 samples per pixel, shaded against a small studio
// environment, and casts a soft contact shadow on the field. Deterministic: seeded noise and dither, and sharp with
// fixed encoder settings, so the same code always writes the same bytes.
//
// What the landing loads (the stage, tablet and phone frames) is WebP at quality 96: about a quarter of the JPEG's
// bytes, every pixel within a level or two of the render, so the near white gradients stay smooth. The 16 : 9 and
// portrait frames stay JPEG (slides, share image): hero-light-3840.jpg is the 4K background still.
//
//   npx tsx tools/gen-hero-bg-light.ts             renders the winning variant, writes the WebPs and the JPEGs
//   npx tsx tools/gen-hero-bg-light.ts --quick     desktop at 1920 × 1080, PNG only, for iteration
//   --stage                                        with --quick: the two stage frames instead (1600 and 1024 wide)
//   --edge                                         with --quick: the phone and tablet frames at half size
//   --variant <name>                               one of VARIANTS below (default: WINNER)
//   --png <dir>                                    where the lossless PNGs go (default: the system temp folder)
//   --no-jpeg                                      PNGs only
//
// Composition (scene units: height = 1). Desktop 16:9, x in [0, 16 / 9]: the copy column (x 25 % to 75 %, y 15 % to
// 60 %) stays calm and nearly flat (#eeeef1 to #f4f4f7); the ribbon enters at the top right, keeps right of
// x ≈ 1.34 beside the copy, opens into a broad silver sheet behind the right cards and leaves through the bottom
// right corner; a soft pale fold crosses the left half under the copy. Phone portrait 1170 × 2532: the same ribbon
// pressed against the right edge. Stages (hero-light-stage-*.jpg, what the landing's hero uses from 1024 px, where the
// centered hero panel runs about as tall as it is wide), 6 : 5 from 1200 px and 9 : 10 below: the same ribbon pressed
// toward the right edge beside the copy and the buttons, opening behind the right cards lower down.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
  type RibbonShape,
  type V3,
  blurPlane,
  clamp,
  crScalar,
  encodePNG,
  fbm,
  mix,
  mulberry32,
  norm3,
  ribbonMesh,
  smoothstep,
} from './lib/silk.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(ROOT, 'apps/web/src/landing/assets');
const argv = process.argv.slice(2);
const QUICK = argv.includes('--quick');
const NO_JPEG = QUICK || argv.includes('--no-jpeg');
const arg = (name: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const OUT = path.resolve(arg('--png') ?? path.join(os.tmpdir(), 'rota-hero-light'));
fs.mkdirSync(OUT, { recursive: true });
const t0 = Date.now();
const log = (m: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);

// ---------------------------------------------------------------- colour (linear sRGB)

const lin = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
const hex = (h: string): V3 => [
  lin(parseInt(h.slice(1, 3), 16)),
  lin(parseInt(h.slice(3, 5), 16)),
  lin(parseInt(h.slice(5, 7), 16)),
];
/** The satin field's base, a cool white between #f4f4f6 and #e6e6ea. */
const SATIN = hex('#f1f1f4');
/** Brand red #FF3B30, the ribbon's piping (and back); its shade side deepens toward #B01D16, never toward pink. */
const RED = hex('#ff3b30');
const RED_DEEP = hex('#b01d16');
/** The ribbon's face: a brighter white than the field, so the sheet reads as a separate glossy material. */
const FACE = hex('#fbfbfc');

// ---------------------------------------------------------------- light

const L = norm3([-0.42, -0.62, 0.66]); // key light from the upper left and the front (screen y points down)
const VIEW: V3 = [0, 0, 1];
const HV = norm3([L[0] + VIEW[0], L[1] + VIEW[1], L[2] + VIEW[2]]);
const LS = norm3([-0.55, -0.7, 0.45]); // the studio soft box the ribbon reflects
const dot3 = (ax: number, ay: number, az: number, b: V3) => ax * b[0] + ay * b[1] + az * b[2];

// ---------------------------------------------------------------- scene description

/**
 * A soft fold in the satin: a curved line (a quadratic bow off a straight base line) with an asymmetric profile
 * across it: a short rise on the light side (a pale crest) and a long fall on the other (a soft shade). The height is
 * in scene units, so slope ≈ amp / sigma.
 */
type Fold = {
  from: [number, number];
  to: [number, number];
  bow: number; // sideways offset at the middle, scene units (positive bows to the right of from → to)
  amp: number;
  rise: number; // sigma on the left of from → to
  fall: number; // sigma on the right
  fade?: [number, number]; // envelope along the line, fractions at either end
};

type LightRibbon = RibbonShape & {
  nu?: number;
  nv?: number;
  back: 'red' | 'face'; // what the other side of the sheet shows
  piping: [number[], number[]]; // red trim width over u at v = 0 and v = 1, fractions of the ribbon width
  /** Along u: the red is whole up to fade[0] and gone by fade[1] (no fade when absent). */
  fade?: [number, number];
  gloss: number;
};

type Scene = {
  name: string;
  w: number;
  h: number;
  calm: [number, number, number, number]; // x0, y0, x1, y1 as fractions of the frame: kept flat for the copy
  folds: Fold[];
  ribbons: LightRibbon[];
  /** Soft tonal pools (scene units): [x, y, radius, gain in linear light]; negative darkens to pale silver. */
  pools: [number, number, number, number][];
};

// ---------------------------------------------------------------- satin field

function foldHeight(f: Fold, x: number, y: number) {
  const dx = f.to[0] - f.from[0];
  const dy = f.to[1] - f.from[1];
  const len = Math.hypot(dx, dy);
  const tx = dx / len;
  const ty = dy / len;
  const px = x - f.from[0];
  const py = y - f.from[1];
  const s = (px * tx + py * ty) / len; // 0 … 1 along the base line
  let c = px * ty - py * tx; // across, positive on the left of from → to (screen space, y down)
  // A parabolic bow through both ends; dividing by the slope keeps c close to a true distance.
  const b = 4 * f.bow * s * (1 - s);
  const db = (4 * f.bow * (1 - 2 * s)) / len;
  c = (c + b) / Math.sqrt(1 + db * db);
  const fade = f.fade ?? [0.15, 0.15];
  const env = smoothstep(-0.05, fade[0], s) * smoothstep(1.05, 1 - fade[1], s);
  const sig = c > 0 ? f.rise : f.fall;
  return f.amp * env * Math.exp(-(c * c) / (2 * sig * sig));
}

function renderSatin(sc: Scene, W: number, H: number) {
  const n = W * H;
  const h = new Float32Array(n);
  for (let y = 0; y < H; y++) {
    const sy = (y + 0.5) / H;
    for (let x = 0; x < W; x++) {
      const sx = (x + 0.5) / H;
      let v = 0;
      for (const f of sc.folds) v += foldHeight(f, sx, sy);
      // A whisper of irregular drape so no fold reads as drawn with a ruler.
      v += 0.0018 * (fbm(sx * 2.2 + 3.1, sy * 2.2 + 7.7, 404) - 0.5);
      h[y * W + x] = v;
    }
  }
  log(`${sc.name}: satin height`);
  const R = new Float32Array(n);
  const G = new Float32Array(n);
  const B = new Float32Array(n);
  const wrap = 0.7;
  const diffuse = (nx: number, ny: number, nz: number) =>
    Math.max(0, (dot3(nx, ny, nz, L) + wrap) / (1 + wrap));
  const sheen = (nx: number, ny: number, nz: number) =>
    Math.pow(Math.max(0, dot3(nx, ny, nz, HV)), 36);
  const D0 = diffuse(0, 0, 1);
  const S0 = sheen(0, 0, 1);
  const [cx0, cy0, cx1, cy1] = sc.calm;
  const A = W / H;
  for (let y = 0; y < H; y++) {
    const sy = (y + 0.5) / H;
    const ym = Math.max(0, y - 1);
    const yp = Math.min(H - 1, y + 1);
    for (let x = 0; x < W; x++) {
      const sx = (x + 0.5) / H;
      const xm = Math.max(0, x - 1);
      const xp = Math.min(W - 1, x + 1);
      const i = y * W + x;
      const hx = ((h[y * W + xp]! - h[y * W + xm]!) * H) / (xp - xm);
      const hy = ((h[yp * W + x]! - h[ym * W + x]!) * H) / (yp - ym);
      const l = Math.hypot(hx, hy, 1);
      const nx = -hx / l;
      const ny = -hy / l;
      const nz = 1 / l;
      // Shading relative to a flat sheet: flat satin is exactly the base colour.
      const lit = diffuse(nx, ny, nz) / D0;
      const sh = 0.05 * (sheen(nx, ny, nz) - S0);
      // The calm column: folds fade out toward the copy, only the tonal pools remain.
      const fx = sx / A;
      const inside =
        smoothstep(cx0 - 0.07, cx0 + 0.04, fx) *
        smoothstep(cx1 + 0.07, cx1 - 0.04, fx) *
        smoothstep(cy0 - 0.1, cy0 + 0.04, sy) *
        smoothstep(cy1 + 0.1, cy1 - 0.02, sy);
      const k = 1 - 0.9 * inside;
      let tone = 1;
      for (const [px, py, pr, pg] of sc.pools) {
        const dx = sx - px;
        const dy = sy - py;
        tone += pg * Math.exp(-(dx * dx + dy * dy) / (2 * pr * pr));
      }
      const m = tone * (1 + k * (lit - 1));
      R[i] = SATIN[0] * m + k * sh;
      G[i] = SATIN[1] * m + k * sh;
      B[i] = SATIN[2] * m + k * sh;
    }
  }
  log(`${sc.name}: satin shaded`);
  return { R, G, B };
}

// ---------------------------------------------------------------- the ribbon: opaque sheet, 4 × 4 supersampled

const SS = 4;

type Mesh = {
  X: Float64Array; // supersampled pixels
  Y: Float64Array;
  Z: Float64Array;
  U: Float32Array;
  V: Float32Array;
  NX: Float32Array; // un-flipped: nz < 0 shows the face, nz > 0 the back
  NY: Float32Array;
  NZ: Float32Array;
  RIB: Uint8Array;
  tris: Int32Array;
};

function buildMesh(sc: Scene, H: number): Mesh {
  const parts = sc.ribbons.map((r) => {
    const nu = r.nu ?? 1800;
    const nv = r.nv ?? 96;
    return { r, nu, nv, ...ribbonMesh(r, nu, nv, H * SS) };
  });
  const total = parts.reduce((a, p) => a + p.N, 0);
  const triCount = parts.reduce((a, p) => a + p.nu * p.nv * 2, 0);
  const m: Mesh = {
    X: new Float64Array(total),
    Y: new Float64Array(total),
    Z: new Float64Array(total),
    U: new Float32Array(total),
    V: new Float32Array(total),
    NX: new Float32Array(total),
    NY: new Float32Array(total),
    NZ: new Float32Array(total),
    RIB: new Uint8Array(total),
    tris: new Int32Array(triCount * 3),
  };
  let base = 0;
  let t = 0;
  parts.forEach((p, ri) => {
    const { X, Y, Z, cols, nu, nv } = p;
    for (let i = 0; i <= nu; i++) {
      const i0 = Math.max(0, i - 1);
      const i1 = Math.min(nu, i + 1);
      for (let j = 0; j <= nv; j++) {
        const j0 = Math.max(0, j - 1);
        const j1 = Math.min(nv, j + 1);
        const k = i * cols + j;
        const ka = i0 * cols + j;
        const kb = i1 * cols + j;
        const kc = i * cols + j0;
        const kd = i * cols + j1;
        const ux = X[kb]! - X[ka]!,
          uy = Y[kb]! - Y[ka]!,
          uz = Z[kb]! - Z[ka]!;
        const vx = X[kd]! - X[kc]!,
          vy = Y[kd]! - Y[kc]!,
          vz = Z[kd]! - Z[kc]!;
        let nx = uy * vz - uz * vy;
        let ny = uz * vx - ux * vz;
        let nz = ux * vy - uy * vx;
        const l = Math.hypot(nx, ny, nz) || 1;
        nx /= l;
        ny /= l;
        nz /= l;
        const o = base + k;
        m.X[o] = X[k]!;
        m.Y[o] = Y[k]!;
        m.Z[o] = Z[k]!;
        m.U[o] = i / nu;
        m.V[o] = j / nv;
        m.NX[o] = nx;
        m.NY[o] = ny;
        m.NZ[o] = nz;
        m.RIB[o] = ri;
      }
    }
    for (let i = 0; i < nu; i++)
      for (let j = 0; j < nv; j++) {
        const k00 = base + i * cols + j;
        const k10 = k00 + cols;
        m.tris.set([k00, k10, k10 + 1, k00, k10 + 1, k00 + 1], t);
        t += 6;
      }
    base += p.N;
  });
  return m;
}

/**
 * Studio environment seen in a reflection vector (screen space, y down): a bright ceiling over a grey floor, a large
 * soft box upper left, a vertical strip light on the left for the long crisp highlight lines, and a grey flag on the
 * right that gives the turning sheet its silver.
 */
function studio(rx: number, ry: number, rz: number) {
  const up = clamp(-ry * 0.8 + rz * 0.35 - rx * 0.15, -1, 1);
  let e = 0.46 + 0.56 * smoothstep(-0.65, 0.8, up);
  e *= 1 - 0.3 * smoothstep(0.2, 0.75, rx);
  e += 0.6 * smoothstep(0.8, 0.95, dot3(rx, ry, rz, LS));
  e += 0.5 * Math.exp(-Math.pow((rx + 0.5) / 0.06, 2)) * smoothstep(-0.7, 0.1, -ry);
  e += 0.28 * Math.exp(-Math.pow((rx - 0.32) / 0.05, 2)) * smoothstep(-0.4, 0.3, -ry);
  return e;
}

function shadeRibbon(
  r: LightRibbon,
  u: number,
  v: number,
  nx0: number,
  ny0: number,
  nz0: number,
  out: Float64Array,
) {
  const l = Math.hypot(nx0, ny0, nz0) || 1;
  let nx = nx0 / l;
  let ny = ny0 / l;
  let nz = nz0 / l;
  const back = nz > 0; // the mesh winds so the face looks down −z
  if (nz < 0) {
    // Shade with the normal that faces the viewer.
    nx = -nx;
    ny = -ny;
    nz = -nz;
  }
  // The red trim is a blend weight, not an on and off test: whole red within 45 % of the trim width, feathering into
  // the satin at its edge, and faded out along the ribbon, so the red edge melts into white and silver instead of
  // ending as a hard stripe or a hairline.
  const pw0 = Math.max(0, crScalar(r.piping[0], u));
  const pw1 = Math.max(0, crScalar(r.piping[1], u));
  const soft = (d: number, w: number) => (w <= 1e-4 ? 0 : smoothstep(w, w * 0.45, d));
  let redK = back && r.back === 'red' ? 1 : Math.max(soft(v, pw0), soft(1 - v, pw1));
  if (r.fade) redK *= smoothstep(r.fade[1], r.fade[0], u);
  const ndl = dot3(nx, ny, nz, L);
  const diff = Math.max(0, (ndl + 0.35) / 1.35);
  // Reflection of the view ray about the normal.
  const rx = 2 * nz * nx;
  const ry = 2 * nz * ny;
  const rz = 2 * nz * nz - 1;
  const env = studio(rx, ry, rz);
  const spec = Math.pow(Math.max(0, dot3(nx, ny, nz, HV)), 140);
  const grazing = Math.pow(1 - nz, 4);
  // Lacquered red: the lit side lands on the brand red, the shade side deepens; the gloss stays narrow and warm.
  const kR = clamp(0.2 + 0.95 * diff, 0, 1.05);
  const gR = r.gloss * (0.5 * spec + 0.06 * grazing * env);
  const R0 = mix(RED_DEEP[0], RED[0], kR) + gR;
  const R1 = mix(RED_DEEP[1], RED[1], kR) + gR * 0.3;
  const R2 = mix(RED_DEEP[2], RED[2], kR) + gR * 0.25;
  // White satin face: mostly reflection (silver where the sheet turns away), a little diffuse body, crisp highlights.
  const F = 0.62 + 0.38 * grazing;
  const base = 0.3 + 0.7 * diff;
  // The cut edges catch the light as a hairline of white.
  const edge = Math.min(v, 1 - v);
  const glint = 0.22 * smoothstep(0.012, 0.002, edge);
  const c = (1 - F) * base + F * env + r.gloss * 0.7 * spec + glint;
  out[0] = mix(FACE[0] * c, R0, redK);
  out[1] = mix(FACE[1] * c, R1, redK);
  out[2] = mix(FACE[2] * c * 1.01, R2, redK);
}

function renderRibbons(sc: Scene, W: number, H: number) {
  const m = buildMesh(sc, H);
  const n = W * H;
  const R = new Float32Array(n);
  const G = new Float32Array(n);
  const B = new Float32Array(n);
  const A = new Float32Array(n);
  const ntri = m.tris.length / 3;
  // Columns the ribbons can reach, in final pixels.
  let minX = Infinity;
  let maxX = -Infinity;
  for (let i = 0; i < m.X.length; i++) {
    minX = Math.min(minX, m.X[i]!);
    maxX = Math.max(maxX, m.X[i]!);
  }
  const fx0 = clamp(Math.floor(minX / SS) - 1, 0, W);
  const fx1 = clamp(Math.ceil(maxX / SS) + 1, 0, W);
  if (fx1 <= fx0) return { R, G, B, A };
  const BW = (fx1 - fx0) * SS;
  const STRIP = 32; // final rows per strip
  const BH = STRIP * SS;
  const depth = new Float32Array(BW * BH);
  const tid = new Int32Array(BW * BH);
  const bc1 = new Float32Array(BW * BH);
  const bc2 = new Float32Array(BW * BH);
  // Bin triangles by strip.
  const strips = Math.ceil(H / STRIP);
  const bins: number[][] = Array.from({ length: strips }, () => []);
  for (let t = 0; t < ntri; t++) {
    const a = m.tris[t * 3]!,
      b = m.tris[t * 3 + 1]!,
      c = m.tris[t * 3 + 2]!;
    const y0 = Math.min(m.Y[a]!, m.Y[b]!, m.Y[c]!);
    const y1 = Math.max(m.Y[a]!, m.Y[b]!, m.Y[c]!);
    const s0 = Math.max(0, Math.floor(y0 / BH));
    const s1 = Math.min(strips - 1, Math.floor(y1 / BH));
    for (let s = s0; s <= s1; s++) bins[s]!.push(t);
  }
  const col = new Float64Array(3);
  let hits = 0;
  for (let s = 0; s < strips; s++) {
    const sy0 = s * BH; // first supersampled row of the strip
    depth.fill(-Infinity);
    tid.fill(-1);
    for (const t of bins[s]!) {
      const a = m.tris[t * 3]!,
        b = m.tris[t * 3 + 1]!,
        c = m.tris[t * 3 + 2]!;
      const x0 = m.X[a]! - fx0 * SS,
        y0 = m.Y[a]! - sy0;
      const x1 = m.X[b]! - fx0 * SS,
        y1 = m.Y[b]! - sy0;
      const x2 = m.X[c]! - fx0 * SS,
        y2 = m.Y[c]! - sy0;
      const area = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
      if (Math.abs(area) < 1e-9) continue;
      const inv = 1 / area;
      const px0 = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
      const px1 = Math.min(BW - 1, Math.ceil(Math.max(x0, x1, x2)));
      const py0 = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
      const py1 = Math.min(BH - 1, Math.ceil(Math.max(y0, y1, y2)));
      const za = m.Z[a]!,
        zb = m.Z[b]!,
        zc = m.Z[c]!;
      for (let py = py0; py <= py1; py++) {
        const cy = py + 0.5;
        for (let px = px0; px <= px1; px++) {
          const cx = px + 0.5;
          // Barycentric weights of b and c; a gets the rest.
          const wb = ((cx - x0) * (y2 - y0) - (cy - y0) * (x2 - x0)) * inv;
          const wc = ((x1 - x0) * (cy - y0) - (y1 - y0) * (cx - x0)) * inv;
          const wa = 1 - wb - wc;
          if (wa < 0 || wb < 0 || wc < 0) continue;
          const z = wa * za + wb * zb + wc * zc;
          const o = py * BW + px;
          if (z <= depth[o]!) continue;
          depth[o] = z;
          tid[o] = t;
          bc1[o] = wb;
          bc2[o] = wc;
        }
      }
    }
    // Resolve: shade every covered sample, average into the final pixel with its coverage.
    const rows = Math.min(STRIP, H - s * STRIP);
    for (let fy = 0; fy < rows; fy++) {
      for (let fx = 0; fx < fx1 - fx0; fx++) {
        let sr = 0,
          sg = 0,
          sb = 0,
          cnt = 0;
        for (let j = 0; j < SS; j++)
          for (let i = 0; i < SS; i++) {
            const o = (fy * SS + j) * BW + fx * SS + i;
            const t = tid[o]!;
            if (t < 0) continue;
            const a = m.tris[t * 3]!,
              b = m.tris[t * 3 + 1]!,
              c = m.tris[t * 3 + 2]!;
            const wb = bc1[o]!,
              wc = bc2[o]!,
              wa = 1 - wb - wc;
            const u = wa * m.U[a]! + wb * m.U[b]! + wc * m.U[c]!;
            const v = wa * m.V[a]! + wb * m.V[b]! + wc * m.V[c]!;
            const nx = wa * m.NX[a]! + wb * m.NX[b]! + wc * m.NX[c]!;
            const ny = wa * m.NY[a]! + wb * m.NY[b]! + wc * m.NY[c]!;
            const nz = wa * m.NZ[a]! + wb * m.NZ[b]! + wc * m.NZ[c]!;
            shadeRibbon(sc.ribbons[m.RIB[a]!]!, u, v, nx, ny, nz, col);
            sr += col[0]!;
            sg += col[1]!;
            sb += col[2]!;
            cnt++;
          }
        if (!cnt) continue;
        hits += cnt;
        const i = (s * STRIP + fy) * W + fx0 + fx;
        const k = 1 / (SS * SS);
        R[i] = sr * k;
        G[i] = sg * k;
        B[i] = sb * k;
        A[i] = cnt * k;
      }
    }
  }
  log(`${sc.name}: ribbons ${ntri} triangles, ${(hits / 1e6).toFixed(1)}M samples`);
  return { R, G, B, A };
}

// ---------------------------------------------------------------- compose and tone

function compose(sc: Scene, W: number, H: number) {
  const bg = renderSatin(sc, W, H);
  const rb = renderRibbons(sc, W, H);
  // Contact shadow and a wider soft one, cast down and to the right of the sheet (the key light is upper left).
  const near = Float32Array.from(rb.A);
  const wide = Float32Array.from(rb.A);
  blurPlane(near, W, H, 0.004 * H);
  blurPlane(wide, W, H, 0.03 * H);
  const offN = Math.round(0.003 * H);
  const offW = Math.round(0.018 * H);
  const at = (p: Float32Array, x: number, y: number) =>
    p[clamp(y, 0, H - 1) * W + clamp(x, 0, W - 1)]!;
  const R = new Float32Array(W * H);
  const G = new Float32Array(W * H);
  const B = new Float32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const sh = 1 - 0.1 * at(near, x - offN, y - offN) - 0.07 * at(wide, x - offW, y - offW);
      const a = rb.A[i]!;
      R[i] = bg.R[i]! * sh * (1 - a) + rb.R[i]!;
      G[i] = bg.G[i]! * sh * (1 - a) + rb.G[i]!;
      B[i] = bg.B[i]! * sh * (1 - a) + rb.B[i]!;
    }
  log(`${sc.name}: composed`);
  return { R, G, B };
}

/** Linear light to 8 bit sRGB with a soft shoulder over 0.92 and triangular dither (no banding at 4K). */
function toSRGB8(img: { R: Float32Array; G: Float32Array; B: Float32Array }, seed: number) {
  const n = img.R.length;
  const out = new Uint8Array(n * 3);
  const rnd = mulberry32(seed);
  const shoulder = (c: number) => (c <= 0.92 ? c : 0.92 + 0.08 * Math.tanh((c - 0.92) / 0.08));
  const enc = (c: number) => {
    const x = clamp(shoulder(c), 0, 1);
    return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
  };
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    out[o] = clamp(Math.round(enc(img.R[i]!) * 255 + rnd() - rnd()), 0, 255);
    out[o + 1] = clamp(Math.round(enc(img.G[i]!) * 255 + rnd() - rnd()), 0, 255);
    out[o + 2] = clamp(Math.round(enc(img.B[i]!) * 255 + rnd() - rnd()), 0, 255);
  }
  return out;
}

/** 2 × 2 box downsample in linear light. */
function halve(img: { R: Float32Array; G: Float32Array; B: Float32Array }, W: number, H: number) {
  const w = W / 2;
  const h = H / 2;
  const R = new Float32Array(w * h);
  const G = new Float32Array(w * h);
  const B = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const a = 2 * y * W + 2 * x;
      const o = y * w + x;
      R[o] = 0.25 * (img.R[a]! + img.R[a + 1]! + img.R[a + W]! + img.R[a + W + 1]!);
      G[o] = 0.25 * (img.G[a]! + img.G[a + 1]! + img.G[a + W]! + img.G[a + W + 1]!);
      B[o] = 0.25 * (img.B[a]! + img.B[a + 1]! + img.B[a + W]! + img.B[a + W + 1]!);
    }
  return { R, G, B };
}

// ---------------------------------------------------------------- scenes

const ASPECT = 16 / 9;

const desktopFolds: Fold[] = [
  // The soft white fold across the left half: a pale crest facing the light, a long soft shade under it.
  { from: [-0.06, 0.33], to: [0.98, 0.86], bow: 0.08, amp: 0.035, rise: 0.012, fall: 0.14 },
  // A broad shallow wave out of the top left corner.
  { from: [-0.12, 0.2], to: [0.42, -0.12], bow: -0.03, amp: 0.012, rise: 0.09, fall: 0.06 },
  // A low swell along the bottom left.
  { from: [-0.08, 0.78], to: [0.5, 1.12], bow: 0.03, amp: 0.008, rise: 0.035, fall: 0.09 },
  // Folds that run into the ribbon from the left, outside the copy column.
  { from: [1.02, 1.08], to: [1.42, 0.5], bow: 0.06, amp: 0.009, rise: 0.03, fall: 0.1 },
  { from: [1.3, -0.06], to: [1.5, 0.38], bow: 0.03, amp: 0.006, rise: 0.04, fall: 0.07 },
];

const desktopPools: Scene['pools'] = [
  [0.89, 0.36, 0.42, 0.025], // the copy sits on the lightest satin
  [0.05, 0.05, 0.3, -0.035], // pale silver in the top left corner
  [1.62, 0.62, 0.32, -0.05], // silver around the ribbon so its white face reads
  [0.1, 1.02, 0.28, -0.03],
];

const sweep = (o: Partial<LightRibbon> & Pick<LightRibbon, 'pts' | 'width' | 'twist'>) =>
  ({
    back: 'face',
    piping: [[0], [0]],
    gloss: 1,
    spline: 'bspline', // C2: no shading crease or silhouette notch at the control points
    ...o,
  }) satisfies LightRibbon;

/** The sweep every variant shares: in at the top right, beside the copy, out through the bottom right corner. */
const SWEEP: V3[] = [
  [1.73, -0.16, 0],
  [1.675, 0.08, 0],
  [1.61, 0.32, 0],
  [1.555, 0.55, 0],
  [1.54, 0.78, 0],
  [1.6, 1.0, 0],
  [1.76, 1.2, 0],
];
const shifted = (dx: number, dz: number): V3[] => SWEEP.map(([x, y, z]) => [x + dx, y, z + dz]);

/**
 * Variants, each a set of ribbons in desktop scene units (x in [0, 16 / 9]); the phone portrait gets the same
 * ribbons pressed against its right edge by `toMobile`. `broad` won: its red edge softens and fades into the
 * white and silver sheet like the reference; `twist` shows a heavy red band with a pinch where it flips, and
 * `pair` ends its red strip in a blade shaped tail.
 */
const VARIANTS: Record<string, LightRibbon[]> = {
  // One two tone ribbon: near the top it shows its red back, flips through edge on and opens into a white satin
  // sheet with a single red piping along its inner edge.
  twist: [
    sweep({
      pts: SWEEP,
      width: [0.1, 0.13, 0.2, 0.34, 0.5, 0.66, 0.8],
      twist: [1.95, 1.82, 1.5, 1.0, 0.62, 0.36, 0.2],
      cup: [0.24, 0.24, 0.22, 0.2, 0.17, 0.14, 0.12],
      back: 'red',
      piping: [[0.1, 0.08, 0.05, 0.015, 0, 0, 0], [0]],
    }),
  ],
  // One broad curling sheet, white on both sides, its inner edge lacquered red at the top, the red softening and
  // fading out by mid height (the reference's red edge melting into white and silver).
  broad: [
    sweep({
      pts: SWEEP,
      width: [0.09, 0.15, 0.25, 0.38, 0.52, 0.68, 0.82],
      twist: [1.16, 1.02, 0.84, 0.62, 0.42, 0.26, 0.14],
      cup: [0.3, 0.29, 0.26, 0.22, 0.18, 0.15, 0.12],
      piping: [[0.17, 0.14, 0.09, 0.04, 0.01, 0, 0], [0]],
      fade: [0.3, 0.58],
    }),
  ],
  // The same sheet without piping, and a narrow two tone ribbon riding its inner edge: red where it turns near the
  // top, then tucking in behind the sheet.
  pair: [
    sweep({
      pts: shifted(0.03, -0.02),
      width: [0.09, 0.15, 0.25, 0.38, 0.52, 0.68, 0.82],
      twist: [1.16, 1.02, 0.84, 0.62, 0.42, 0.26, 0.14],
      cup: [0.3, 0.29, 0.26, 0.22, 0.18, 0.15, 0.12],
    }),
    sweep({
      pts: [
        [1.665, -0.14, 0.05],
        [1.6, 0.08, 0.05],
        [1.52, 0.3, 0.035],
        [1.45, 0.5, -0.01],
        [1.43, 0.7, -0.09],
        [1.5, 0.9, -0.12],
      ],
      width: [0.045, 0.05, 0.055, 0.055, 0.05, 0.045],
      twist: [2.2, 1.95, 1.62, 1.25, 0.9, 0.6],
      cup: [0.2, 0.2, 0.18, 0.15, 0.12, 0.1],
      back: 'red',
      piping: [[0.14, 0.12, 0.08, 0.03, 0, 0], [0]],
    }),
  ],
};
const WINNER = 'broad';

/**
 * The phone portrait (x in [0, 0.462]): the desktop ribbons are pressed against the right edge, narrow beside the
 * copy in the upper half and wider behind the phone mockup lower down.
 */
function toMobile(r: LightRibbon, mobileAspect: number): LightRibbon {
  // Positions are pressed harder than widths, so the red lines keep about 2 css px on a 3× screen.
  const press = (y: number) => mix(0.24, 0.44, smoothstep(0.35, 0.9, y));
  const thin = (y: number) => mix(0.34, 0.44, smoothstep(0.35, 0.9, y));
  const yAt = (n: number, i: number) =>
    crScalar(
      r.pts.map((p) => p[1]),
      i / Math.max(1, n - 1),
    );
  return {
    ...r,
    pts: r.pts.map(([x, y, z]) => [mobileAspect - (ASPECT - x) * press(y), y, z] as V3),
    width: r.width.map((w, i) => w * thin(yAt(r.width.length, i))),
  };
}

function desktopScene(ribbons: LightRibbon[], W: number): Scene {
  return {
    name: 'desktop',
    w: W,
    h: Math.round(W / ASPECT),
    calm: [0.25, 0.15, 0.75, 0.6],
    folds: desktopFolds,
    ribbons,
    pools: desktopPools,
  };
}

function mobileScene(ribbons: LightRibbon[]): Scene {
  const w = 1170;
  const h = 2532;
  return {
    name: 'mobile',
    w,
    h,
    calm: [0.06, 0.12, 0.84, 0.5],
    folds: [
      { from: [-0.04, 0.5], to: [0.38, 0.74], bow: 0.02, amp: 0.005, rise: 0.012, fall: 0.07 },
      { from: [-0.06, 0.1], to: [0.2, -0.06], bow: -0.01, amp: 0.008, rise: 0.05, fall: 0.04 },
      { from: [0.1, 1.04], to: [0.42, 0.62], bow: 0.03, amp: 0.006, rise: 0.025, fall: 0.06 },
    ],
    ribbons: ribbons.map((r) => toMobile(r, w / h)),
    pools: [
      [0.23, 0.3, 0.25, 0.025],
      [0.02, 0.02, 0.18, -0.04],
      [0.46, 0.62, 0.16, -0.045],
    ],
  };
}

/**
 * The edge frames: the landing's hero on phones (390 × about 1150 css px) and tablets (768 × about 1300), where the
 * centered copy runs nearly edge to edge from the badge to the platforms row. The ribbon enters at the top right
 * corner beside the app icon with its red lines, curls out past the right edge beside the copy, and comes back in
 * as a broad silver sheet behind the phone. `out` is how far past the edge it swings (negative press).
 */
type EdgeFrame = {
  name: string;
  w: number;
  h: number;
  /** Press at the top, beside the copy (negative: past the edge) and at the bottom. */
  press: [number, number, number];
  /** Heights where the ribbon starts and ends its way back in. */
  back: [number, number];
  thin: number;
  /**
   * The red trim over u on the inner edge, replacing the variant's: red at the top right corner, and red again on the
   * edge of the sheet where it comes back in behind the phone, so the ribbon reads on a narrow screen too (the soft
   * fade of the stages would leave only a sliver at the top). No fade.
   */
  piping: number[];
};

const EDGE_PIPING = [0.2, 0.15, 0.07, 0.045, 0.05, 0.03, 0.006];

const EDGES: Record<'phone' | 'tablet', EdgeFrame> = {
  phone: {
    name: 'phone',
    w: 1170,
    h: 3450,
    press: [0.45, -0.7, 0.62],
    back: [0.42, 0.82],
    thin: 0.4,
    piping: EDGE_PIPING,
  },
  tablet: {
    name: 'tablet',
    w: 1536,
    h: 2600,
    press: [0.45, -0.5, 0.6],
    back: [0.45, 0.85],
    thin: 0.5,
    piping: EDGE_PIPING,
  },
};

function toEdge(r: LightRibbon, f: EdgeFrame): LightRibbon {
  const aspect = f.w / f.h;
  const [top, out, low] = f.press;
  const press = (y: number) =>
    top +
    (out - top) * smoothstep(0.0, 0.24, y) +
    (low - out) * smoothstep(f.back[0], f.back[1], y);
  const thin = (y: number) => f.thin * mix(0.85, 1.15, smoothstep(0.35, 0.9, y));
  const yAt = (n: number, i: number) =>
    crScalar(
      r.pts.map((p) => p[1]),
      i / Math.max(1, n - 1),
    );
  return {
    ...r,
    pts: r.pts.map(([x, y, z]) => [aspect - (ASPECT - x) * press(y), y, z] as V3),
    width: r.width.map((w, i) => w * thin(yAt(r.width.length, i))),
    piping: [f.piping, r.piping[1]],
    fade: undefined,
  };
}

function edgeScene(ribbons: LightRibbon[], f: EdgeFrame, scale = 1): Scene {
  const aspect = f.w / f.h;
  return {
    name: f.name,
    w: Math.round(f.w * scale),
    h: Math.round(f.h * scale),
    calm: [0.04, 0.12, 0.96, 0.56],
    folds: [
      {
        from: [-0.04, 0.5],
        to: [aspect * 0.8, 0.74],
        bow: 0.02,
        amp: 0.005,
        rise: 0.012,
        fall: 0.07,
      },
      {
        from: [-0.06, 0.08],
        to: [aspect * 0.45, -0.06],
        bow: -0.01,
        amp: 0.008,
        rise: 0.05,
        fall: 0.04,
      },
      {
        from: [aspect * 0.2, 1.04],
        to: [aspect * 0.9, 0.62],
        bow: 0.03,
        amp: 0.006,
        rise: 0.025,
        fall: 0.06,
      },
    ],
    ribbons: ribbons.map((r) => toEdge(r, f)),
    pools: [
      [aspect * 0.5, 0.3, 0.25, 0.025],
      [0.02, 0.02, 0.16, -0.04],
      [aspect * 0.95, 0.75, 0.16, -0.045],
    ],
  };
}

/**
 * A stage frame: the centered hero panel of the landing, about as tall as it is wide. `wide` (6 : 5) serves screens
 * from 1200 px; `narrow` (9 : 10) the panel from 1024 to 1199 px, where the copy column takes more of the width, so
 * its ribbon is pressed harder against the right edge.
 */
type StageFrame = {
  name: string;
  aspect: number;
  /** How far the ribbon positions keep from the right edge, beside the copy (top) and lower down (bottom). */
  press: [number, number];
  /** Ribbon widths, the same way. */
  thin: [number, number];
  calm: Scene['calm'];
  pools: Scene['pools'];
};

const STAGES: Record<'wide' | 'narrow', StageFrame> = {
  wide: {
    name: 'stage',
    aspect: 1.2,
    press: [0.66, 1.3],
    thin: [0.85, 1.4],
    calm: [0.26, 0.1, 0.78, 0.56],
    pools: [
      [0.6, 0.34, 0.36, 0.025], // the copy sits on the lightest satin
      [0.04, 0.05, 0.26, -0.035], // pale silver in the top left corner
      [1.1, 0.7, 0.3, -0.08], // deeper silver around the ribbon so its white face reads
      [0.08, 1.02, 0.26, -0.03],
    ],
  },
  narrow: {
    name: 'stage-narrow',
    aspect: 0.9,
    press: [0.3, 0.6],
    thin: [0.52, 0.72],
    calm: [0.16, 0.1, 0.84, 0.56],
    pools: [
      [0.45, 0.34, 0.32, 0.025],
      [0.03, 0.05, 0.22, -0.035],
      [0.84, 0.72, 0.26, -0.05],
      [0.06, 1.02, 0.22, -0.03],
    ],
  },
};

/**
 * The desktop ribbons in a stage frame: positions pressed toward the right edge beside the copy and the buttons
 * (the inner edge stays right of about 78 % of the width down to 55 % of the height), relaxing lower down so the
 * sheet opens behind the right cards; widths pressed less, so the red lines keep their weight.
 */
function toStage(r: LightRibbon, f: StageFrame): LightRibbon {
  const press = (y: number) => mix(f.press[0], f.press[1], smoothstep(0.55, 1.0, y));
  const thin = (y: number) => mix(f.thin[0], f.thin[1], smoothstep(0.5, 1.0, y));
  const yAt = (n: number, i: number) =>
    crScalar(
      r.pts.map((p) => p[1]),
      i / Math.max(1, n - 1),
    );
  return {
    ...r,
    pts: r.pts.map(([x, y, z]) => [f.aspect - (ASPECT - x) * press(y), y, z] as V3),
    width: r.width.map((w, i) => w * thin(yAt(r.width.length, i))),
  };
}

function stageScene(ribbons: LightRibbon[], f: StageFrame, W: number): Scene {
  const toX = (x: number) => (x * f.aspect) / ASPECT;
  return {
    name: f.name,
    w: W,
    h: Math.round(W / f.aspect / 2) * 2,
    calm: f.calm,
    folds: desktopFolds.map((d) => ({
      ...d,
      from: [toX(d.from[0]), d.from[1]] as [number, number],
      to: [toX(d.to[0]), d.to[1]] as [number, number],
    })),
    ribbons: ribbons.map((r) => toStage(r, f)),
    pools: f.pools,
  };
}

// ---------------------------------------------------------------- run

const variantName = arg('--variant') ?? WINNER;
const variant = VARIANTS[variantName];
if (!variant)
  throw new Error(`unknown variant ${variantName}: ${Object.keys(VARIANTS).join(', ')}`);

async function writeJpeg(px: Uint8Array, w: number, h: number, file: string, quality: number) {
  await sharp(Buffer.from(px), { raw: { width: w, height: h, channels: 3 } })
    // Plain libjpeg (no trellis) at full chroma keeps the dither, so the near white gradients stay free of bands.
    .jpeg({ quality, chromaSubsampling: '4:4:4', progressive: true })
    .toFile(file);
  return fs.statSync(file).size;
}

/** The landing's frames: lossy WebP at 96 with sharp's smart chroma subsampling keeps the dither nearly whole. */
async function writeWebp(px: Uint8Array, w: number, h: number, file: string) {
  await sharp(Buffer.from(px), { raw: { width: w, height: h, channels: 3 } })
    .webp({ quality: 96, effort: 6, smartSubsample: true })
    .toFile(file);
  return fs.statSync(file).size;
}
const kb = (n: number) => `${Math.round(n / 1024)} KB`;

const tag = `hero-light-${variantName}`;
if (QUICK && argv.includes('--edge')) {
  for (const f of [EDGES.phone, EDGES.tablet]) {
    const sc = edgeScene(variant, f, 0.5);
    const file = path.join(OUT, `${tag}-${f.name}-quick.png`);
    fs.writeFileSync(file, encodePNG(sc.w, sc.h, toSRGB8(compose(sc, sc.w, sc.h), 1023)));
    log(`wrote ${file}`);
  }
  process.exit(0);
}
if (QUICK && argv.includes('--stage')) {
  for (const [f, w] of [
    [STAGES.wide, 1600],
    [STAGES.narrow, 1024],
  ] as const) {
    const st = stageScene(variant, f, w);
    const file = path.join(OUT, `${tag}-${f.name}-quick.png`);
    fs.writeFileSync(file, encodePNG(st.w, st.h, toSRGB8(compose(st, st.w, st.h), 1019)));
    log(`wrote ${file}`);
  }
  process.exit(0);
}
const DW = QUICK ? 1920 : 3840;
const desk = desktopScene(variant, DW);
const img = compose(desk, desk.w, desk.h);
if (QUICK) {
  fs.writeFileSync(
    path.join(OUT, `${tag}-quick.png`),
    encodePNG(desk.w, desk.h, toSRGB8(img, 1016)),
  );
  log(`wrote ${path.join(OUT, `${tag}-quick.png`)}`);
} else {
  const big = toSRGB8(img, 1016);
  const smallImg = halve(img, desk.w, desk.h);
  const small = toSRGB8(smallImg, 1017);
  fs.writeFileSync(path.join(OUT, `${tag}-3840.png`), encodePNG(desk.w, desk.h, big));
  fs.writeFileSync(path.join(OUT, `${tag}-1920.png`), encodePNG(desk.w / 2, desk.h / 2, small));
  const mob = mobileScene(variant);
  const mobPx = toSRGB8(compose(mob, mob.w, mob.h), 1018);
  fs.writeFileSync(path.join(OUT, `${tag}-mobile.png`), encodePNG(mob.w, mob.h, mobPx));
  const st = stageScene(variant, STAGES.wide, 3200);
  const stImg = compose(st, st.w, st.h);
  const stBig = toSRGB8(stImg, 1019);
  const stSmall = toSRGB8(halve(stImg, st.w, st.h), 1020);
  fs.writeFileSync(path.join(OUT, `${tag}-stage-3200.png`), encodePNG(st.w, st.h, stBig));
  fs.writeFileSync(path.join(OUT, `${tag}-stage-1600.png`), encodePNG(st.w / 2, st.h / 2, stSmall));
  const nr = stageScene(variant, STAGES.narrow, 2400);
  const nrImg = compose(nr, nr.w, nr.h);
  const nrBig = toSRGB8(nrImg, 1021);
  const nrSmall = toSRGB8(halve(nrImg, nr.w, nr.h), 1022);
  fs.writeFileSync(path.join(OUT, `${tag}-stage-narrow-2400.png`), encodePNG(nr.w, nr.h, nrBig));
  fs.writeFileSync(
    path.join(OUT, `${tag}-stage-narrow-1200.png`),
    encodePNG(nr.w / 2, nr.h / 2, nrSmall),
  );
  const edges = [EDGES.phone, EDGES.tablet].map((f, i) => {
    const sc = edgeScene(variant, f);
    const px = toSRGB8(compose(sc, sc.w, sc.h), 1024 + i);
    fs.writeFileSync(path.join(OUT, `${tag}-${f.name}.png`), encodePNG(sc.w, sc.h, px));
    return { sc, px };
  });
  log(`wrote PNGs to ${OUT}`);
  if (!NO_JPEG) {
    const q4 = Number(process.env.Q4K ?? 96);
    const q2 = Number(process.env.Q2K ?? 96);
    const qm = Number(process.env.QM ?? 95);
    log(
      `hero-light-3840.jpg ${kb(await writeJpeg(big, desk.w, desk.h, path.join(ASSETS, 'hero-light-3840.jpg'), q4))}`,
    );
    log(
      `hero-light-1920.jpg ${kb(await writeJpeg(small, desk.w / 2, desk.h / 2, path.join(ASSETS, 'hero-light-1920.jpg'), q2))}`,
    );
    log(
      `hero-light-mobile.jpg ${kb(await writeJpeg(mobPx, mob.w, mob.h, path.join(ASSETS, 'hero-light-mobile.jpg'), qm))}`,
    );
    const webps: [Uint8Array, number, number, string][] = [
      [stBig, st.w, st.h, 'hero-light-stage-3200.webp'],
      [stSmall, st.w / 2, st.h / 2, 'hero-light-stage-1600.webp'],
      [nrBig, nr.w, nr.h, 'hero-light-stage-narrow-2400.webp'],
      [nrSmall, nr.w / 2, nr.h / 2, 'hero-light-stage-narrow-1200.webp'],
      ...edges.map(
        ({ sc, px }) =>
          [px, sc.w, sc.h, `hero-light-${sc.name}.webp`] as [Uint8Array, number, number, string],
      ),
    ];
    for (const [px, w, h, file] of webps)
      log(`${file} ${kb(await writeWebp(px, w, h, path.join(ASSETS, file)))}`);
  }
}
log('done');
