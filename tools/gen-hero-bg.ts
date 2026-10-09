// The landing hero background (apps/web/src/landing/assets/hero-bg-*.jpg), art direction «silk»: translucent red
// silk ribbons modelled as twisting 3D sheets, splatted into float buffers (density = true area / projected area, so
// grazing parts and folds glow), depth of field by layer, bloom, vignette, filmic tone map, film grain and dither.
// Deterministic: the same code always writes the same pixels.
//
//   npx tsx tools/gen-hero-bg.ts             renders 3840 × 2160, writes hero-bg-3840.jpg and hero-bg-1920.jpg
//   npx tsx tools/gen-hero-bg.ts --quick     renders 1920 × 1080 into the PNG folder only, for iteration
//   --png <dir>                              where the lossless PNGs go (default: the system temp folder)
//
// Composition (scene units: height = 1, x in [0, 16 / 9]): the copy column sits at x < 0.85 and stays near black;
// the phone stands around x 1.1 to 1.5, y 0.15 to 1.0 on desktop widths, and the brightest folds frame its lower
// left corner and run on behind its right edge. Node built ins only; the JPEGs come from macOS sips.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(ROOT, 'apps/web/src/landing/assets');
const argv = process.argv.slice(2);
const QUICK = argv.includes('--quick');
const pngAt = argv.indexOf('--png');
const OUT =
  pngAt >= 0 && argv[pngAt + 1]
    ? path.resolve(argv[pngAt + 1]!)
    : path.join(os.tmpdir(), 'rota-hero-bg');
fs.mkdirSync(OUT, { recursive: true });
const W = QUICK ? 1920 : 3840;
const H = (W * 9) / 16;
const ASPECT = W / H; // scene units: y in [0, 1], x in [0, ASPECT]
const t0 = Date.now();
const log = (m: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);

// ---------------------------------------------------------------- math helpers

type V3 = [number, number, number];
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix: number, iy: number, seed: number) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1]. */
function vnoise(x: number, y: number, seed: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  return mix(mix(a, b, sx), mix(c, d, sx), sy);
}

function fbm(x: number, y: number, seed: number) {
  return (
    0.55 * vnoise(x, y, seed) +
    0.3 * vnoise(x * 2.03, y * 2.03, seed + 17) +
    0.15 * vnoise(x * 4.1, y * 4.1, seed + 41)
  );
}

/** Uniform Catmull Rom through scalar control values spread evenly over u in [0, 1]. */
function crScalar(vals: number[], u: number) {
  const n = vals.length;
  if (n === 1) return vals[0]!;
  const t = clamp(u, 0, 1) * (n - 1);
  const i = Math.min(Math.floor(t), n - 2);
  const f = t - i;
  const p0 = vals[Math.max(i - 1, 0)]!;
  const p1 = vals[i]!;
  const p2 = vals[i + 1]!;
  const p3 = vals[Math.min(i + 2, n - 1)]!;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * f +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f +
      (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f)
  );
}

function crPoint(pts: V3[], u: number): V3 {
  return [0, 1, 2].map((k) =>
    crScalar(
      pts.map((p) => p[k]!),
      u,
    ),
  ) as V3;
}

const norm3 = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// ---------------------------------------------------------------- linear RGB float layers

type Layer = {
  w: number;
  h: number;
  scale: number;
  R: Float32Array;
  G: Float32Array;
  B: Float32Array;
};
function layer(w: number, h: number, scale: number): Layer {
  const n = w * h;
  return { w, h, scale, R: new Float32Array(n), G: new Float32Array(n), B: new Float32Array(n) };
}

function boxesForGauss(sigma: number, n = 3) {
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  return Array.from({ length: n }, (_, i) => ((i < m ? wl : wu) - 1) / 2);
}

function blurLine(
  src: Float32Array,
  dst: Float32Array,
  off: number,
  stride: number,
  n: number,
  r: number,
) {
  const inv = 1 / (2 * r + 1);
  let acc = 0;
  for (let k = -r; k <= r; k++) acc += src[off + clamp(k, 0, n - 1) * stride]!;
  for (let i = 0; i < n; i++) {
    dst[off + i * stride] = acc * inv;
    const add = i + r + 1 < n ? i + r + 1 : n - 1;
    const rem = i - r > 0 ? i - r : 0;
    acc += src[off + add * stride]! - src[off + rem * stride]!;
  }
}

function blurPlane(p: Float32Array, w: number, h: number, sigma: number) {
  if (sigma < 0.3) return;
  const tmp = new Float32Array(p.length);
  for (const r0 of boxesForGauss(sigma)) {
    const r = Math.max(0, Math.round(r0));
    if (r === 0) continue;
    for (let y = 0; y < h; y++) blurLine(p, tmp, y * w, 1, w, r);
    for (let x = 0; x < w; x++) blurLine(tmp, p, x, w, h, r);
  }
}
function blurLayer(L: Layer, sigma: number) {
  for (const p of [L.R, L.G, L.B]) blurPlane(p, L.w, L.h, sigma);
}

/** Bilinear sample of a plane at continuous pixel coords (pixel centres at i + 0.5). */
function sampleBilinear(p: Float32Array, w: number, h: number, x: number, y: number) {
  const fx = clamp(x - 0.5, 0, w - 1.001);
  const fy = clamp(y - 0.5, 0, h - 1.001);
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const ax = fx - ix;
  const ay = fy - iy;
  const i = iy * w + ix;
  return mix(mix(p[i]!, p[i + 1]!, ax), mix(p[i + w]!, p[i + w + 1]!, ax), ay);
}

/** dst += k * upsample(src). */
function addUpsampled(dst: Layer, src: Layer, k: number) {
  const sx = src.w / dst.w;
  const sy = src.h / dst.h;
  for (let y = 0; y < dst.h; y++) {
    const fy = (y + 0.5) * sy;
    for (let x = 0; x < dst.w; x++) {
      const fx = (x + 0.5) * sx;
      const i = y * dst.w + x;
      dst.R[i]! += k * sampleBilinear(src.R, src.w, src.h, fx, fy);
      dst.G[i]! += k * sampleBilinear(src.G, src.w, src.h, fx, fy);
      dst.B[i]! += k * sampleBilinear(src.B, src.w, src.h, fx, fy);
    }
  }
}

function downsample(src: Layer, f: number): Layer {
  const d = layer(Math.floor(src.w / f), Math.floor(src.h / f), src.scale / f);
  const inv = 1 / (f * f);
  for (let y = 0; y < d.h; y++)
    for (let x = 0; x < d.w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let j = 0; j < f; j++)
        for (let i = 0; i < f; i++) {
          const k = (y * f + j) * src.w + x * f + i;
          r += src.R[k]!;
          g += src.G[k]!;
          b += src.B[k]!;
        }
      const o = y * d.w + x;
      d.R[o] = r * inv;
      d.G[o] = g * inv;
      d.B[o] = b * inv;
    }
  return d;
}

// ---------------------------------------------------------------- ribbons

type Ribbon = {
  name: string;
  layer: 'far' | 'mid' | 'near';
  pts: V3[]; // centre line in scene units (z only shapes the normals)
  width: number[]; // control values over u, scene units
  twist: number[]; // radians over u; ±π/2 is edge on, which folds the sheet
  cup?: number[]; // cross section curvature over u (sheet bends like fabric), fraction of width
  body: number; // emission per true area (thickness glow)
  spec: number; // surface gloss
  rim: number; // edge line peak
  fade: [number, number]; // envelope in and out, fractions of u
  hue?: V3; // body colour, linear
  seed: number;
  nu?: number;
  nv?: number;
};

// Brand red #FF3B30 lives in the gloss and the edge lines; the far sheets are crimson, a warmer highlight between
// #FF6555 and #FF9D8E tips the hottest folds.
const CRIMSON: V3 = [1, 0.025, 0.032];
const GLOSS: V3 = [1, 0.085, 0.06];
// Ribbon bodies lean toward oxblood (#5A1410 to #7A1A12); the brand red is kept for fold crests and edge lines.
const OXBLOOD: V3 = [1, 0.05, 0.036];
const RIM_GAIN = 1.15;
// The whole ribbon field, moved right and down so the brightest fold frames the phone's lower left corner.
const SHIFT = { x: 0.09, y: 0.03 };
const L = norm3([-0.75, -0.55, 0.38]); // grazing light from the upper left
const VIEW: V3 = [0, 0, 1];
const HV = norm3([L[0] + VIEW[0], L[1] + VIEW[1], L[2] + VIEW[2]]);

const SAMPLE_SPACING = 0.5; // px between splat samples

function renderRibbon(r: Ribbon, dst: Layer) {
  const S = dst.scale;
  const nu = r.nu ?? 1400;
  const nv = r.nv ?? 56;
  const cols = nv + 1;
  const N = (nu + 1) * cols;
  const X = new Float64Array(N);
  const Y = new Float64Array(N);
  const Z = new Float64Array(N);
  const env = new Float64Array(nu + 1);

  for (let i = 0; i <= nu; i++) {
    const u = i / nu;
    const C = crPoint(r.pts, u);
    const e = 1e-3;
    const a = crPoint(r.pts, Math.max(0, u - e));
    const b = crPoint(r.pts, Math.min(1, u + e));
    const T = norm3([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    const N1 = norm3([T[1], -T[0], 0]);
    const N2 = cross(T, N1);
    const phi = crScalar(r.twist, u);
    const w = Math.max(0, crScalar(r.width, u));
    const d: V3 = [
      Math.cos(phi) * N1[0] + Math.sin(phi) * N2[0],
      Math.cos(phi) * N1[1] + Math.sin(phi) * N2[1],
      Math.cos(phi) * N1[2] + Math.sin(phi) * N2[2],
    ];
    env[i] = smoothstep(0, r.fade[0], u) * smoothstep(1, 1 - r.fade[1], u);
    const dp = cross(T, d); // perpendicular to the sheet at the centre line
    const cup = r.cup ? crScalar(r.cup, u) : 0;
    for (let j = 0; j <= nv; j++) {
      const v = j / nv - 0.5;
      const k = i * cols + j;
      const bend = cup * w * (4 * v * v - 1 / 3);
      X[k] = (C[0] + v * w * d[0] + bend * dp[0]) * S;
      Y[k] = (C[1] + v * w * d[1] + bend * dp[1]) * S;
      Z[k] = (C[2] + v * w * d[2] + bend * dp[2]) * S;
    }
  }

  // Per vertex emission (linear RGB per unit of true area) and the edge gloss for the rims.
  const ER = new Float32Array(N);
  const EG = new Float32Array(N);
  const EB = new Float32Array(N);
  const RIM = new Float32Array((nu + 1) * 2);
  const hue = r.hue ?? OXBLOOD;
  for (let i = 0; i <= nu; i++) {
    const u = i / nu;
    const i0 = Math.max(0, i - 1);
    const i1 = Math.min(nu, i + 1);
    for (let j = 0; j <= nv; j++) {
      const v = j / nv;
      const j0 = Math.max(0, j - 1);
      const j1 = Math.min(nv, j + 1);
      const ka = i0 * cols + j;
      const kb = i1 * cols + j;
      const kc = i * cols + j0;
      const kd = i * cols + j1;
      const Su: V3 = [X[kb]! - X[ka]!, Y[kb]! - Y[ka]!, Z[kb]! - Z[ka]!];
      const Sv: V3 = [X[kd]! - X[kc]!, Y[kd]! - Y[kc]!, Z[kd]! - Z[kc]!];
      let n = norm3(cross(Su, Sv));
      if (n[2] < 0) n = [-n[0], -n[1], -n[2]];
      const nz = n[2];
      const nh = Math.max(0, dot(n, HV));
      const T = norm3(Su);
      const th = dot(T, HV);
      const kk = Math.pow(Math.sqrt(Math.max(0, 1 - th * th)), 30); // anisotropic silk sheen along the fibres
      // The broad sheen is held about a third below the edge lines, so the folds lead and nothing reads airbrushed.
      const gloss = 0.034 * Math.pow(nh, 8) + 0.62 * Math.pow(nh, 50) + 0.082 * kk;
      const m = 0.5 + 1.0 * fbm(u * 6 + r.seed, v * 1.4, r.seed); // uneven thickness, never uniform plastic
      // Fine fibres along the flow: two detuned frequencies, warped so they never read as stripes.
      const warp = fbm(u * 3.1 + r.seed * 0.7, v * 2.2, r.seed + 3);
      const fib =
        1 +
        0.22 *
          Math.sin(2 * Math.PI * (v * 47 + 1.7 * warp)) *
          Math.sin(2 * Math.PI * (v * 13.3 + 0.9 * warp + 0.3)) +
        0.12 * Math.sin(2 * Math.PI * (v * 131 + 3.1 * warp + u * 2));
      const fres = 0.07 + 0.93 * Math.pow(1 - nz, 2.6); // a flat sheet is nearly clear, a curling one glows
      const e = env[i]!;
      const body = r.body * e * m * fib * fres;
      const sp = r.spec * e * gloss * nz * (0.5 + 0.8 * m) * fib;
      const k = i * cols + j;
      ER[k] = hue[0] * body + GLOSS[0] * sp;
      EG[k] = hue[1] * body + GLOSS[1] * sp;
      EB[k] = hue[2] * body + GLOSS[2] * sp;
      if (j === 0 || j === nv) {
        const kkE = Math.pow(Math.sqrt(Math.max(0, 1 - th * th)), 12);
        const fl = fbm(u * 9 + r.seed * 3 + j, 0.5, r.seed + 7);
        const flicker = 0.06 + 3.2 * fl * fl * fl;
        RIM[i * 2 + (j === 0 ? 0 : 1)] =
          r.rim * e * (0.22 + 0.78 * kkE) * flicker * (0.45 + 0.55 * (1 - nz));
      }
    }
  }

  // Splat every cell with enough samples that neighbours sit ≤ SAMPLE_SPACING px apart.
  const { w: BW, h: BH, R: PR, G: PG, B: PB } = dst;
  let samples = 0;
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const k00 = i * cols + j;
      const k10 = k00 + cols;
      const k01 = k00 + 1;
      const k11 = k10 + 1;
      const x00 = X[k00]!,
        x10 = X[k10]!,
        x01 = X[k01]!,
        x11 = X[k11]!;
      const y00 = Y[k00]!,
        y10 = Y[k10]!,
        y01 = Y[k01]!,
        y11 = Y[k11]!;
      const e00 = ER[k00]! + EG[k00]! + EB[k00]!;
      if (e00 + ER[k11]! + ER[k10]! + ER[k01]! < 1e-7) continue;
      // Off screen cull with margin.
      const minx = Math.min(x00, x10, x01, x11),
        maxx = Math.max(x00, x10, x01, x11);
      const miny = Math.min(y00, y10, y01, y11),
        maxy = Math.max(y00, y10, y01, y11);
      if (maxx < -2 || maxy < -2 || minx > BW + 2 || miny > BH + 2) continue;
      // True 3D area of the cell (two triangles).
      const ax = x10 - x00,
        ay = y10 - y00,
        az = Z[k10]! - Z[k00]!;
      const bx = x11 - x00,
        by = y11 - y00,
        bz = Z[k11]! - Z[k00]!;
      const cx = x01 - x00,
        cy = y01 - y00,
        cz = Z[k01]! - Z[k00]!;
      const t1 = Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
      const t2 = Math.hypot(by * cz - bz * cy, bz * cx - bx * cz, bx * cy - by * cx);
      const area = 0.5 * (t1 + t2);
      const len = Math.max(
        Math.hypot(ax, ay),
        Math.hypot(cx, cy),
        Math.hypot(bx, by),
        Math.hypot(x10 - x01, y10 - y01),
      );
      const n = Math.min(160, Math.max(1, Math.ceil(len / SAMPLE_SPACING)));
      const wgt = area / (n * n);
      samples += n * n;
      for (let a = 0; a < n; a++) {
        const s = (a + 0.5) / n;
        const xa0 = x00 + (x10 - x00) * s,
          xa1 = x01 + (x11 - x01) * s;
        const ya0 = y00 + (y10 - y00) * s,
          ya1 = y01 + (y11 - y01) * s;
        const ra0 = ER[k00]! + (ER[k10]! - ER[k00]!) * s,
          ra1 = ER[k01]! + (ER[k11]! - ER[k01]!) * s;
        const ga0 = EG[k00]! + (EG[k10]! - EG[k00]!) * s,
          ga1 = EG[k01]! + (EG[k11]! - EG[k01]!) * s;
        const ba0 = EB[k00]! + (EB[k10]! - EB[k00]!) * s,
          ba1 = EB[k01]! + (EB[k11]! - EB[k01]!) * s;
        for (let b = 0; b < n; b++) {
          const t = (b + 0.5) / n;
          const px = xa0 + (xa1 - xa0) * t - 0.5;
          const py = ya0 + (ya1 - ya0) * t - 0.5;
          const ix = Math.floor(px),
            iy = Math.floor(py);
          if (ix < 0 || iy < 0 || ix >= BW - 1 || iy >= BH - 1) continue;
          const fx = px - ix,
            fy = py - iy;
          const cr = (ra0 + (ra1 - ra0) * t) * wgt;
          const cg = (ga0 + (ga1 - ga0) * t) * wgt;
          const cb = (ba0 + (ba1 - ba0) * t) * wgt;
          const w00 = (1 - fx) * (1 - fy),
            w10 = fx * (1 - fy),
            w01 = (1 - fx) * fy,
            w11 = fx * fy;
          const o = iy * BW + ix;
          PR[o]! += cr * w00;
          PR[o + 1]! += cr * w10;
          PR[o + BW]! += cr * w01;
          PR[o + BW + 1]! += cr * w11;
          PG[o]! += cg * w00;
          PG[o + 1]! += cg * w10;
          PG[o + BW]! += cg * w01;
          PG[o + BW + 1]! += cg * w11;
          PB[o]! += cb * w00;
          PB[o + 1]! += cb * w10;
          PB[o + BW]! += cb * w01;
          PB[o + BW + 1]! += cb * w11;
        }
      }
    }
  }

  // Rims: thin gaussian lines along both edges, peak brightness = RIM value, width fixed in screen space.
  if (r.rim > 0) {
    const sigma = Math.max(0.55, 0.00042 * H) * (dst.scale / H); // ≈ 0.9 px at 4K
    const rad = Math.ceil(sigma * 3);
    const norm = 1 / (Math.sqrt(2 * Math.PI) * sigma);
    for (const side of [0, 1]) {
      const j = side === 0 ? 0 : nv;
      for (let i = 0; i < nu; i++) {
        const k0 = i * cols + j;
        const k1 = k0 + cols;
        const r0 = RIM[i * 2 + side]!,
          r1 = RIM[(i + 1) * 2 + side]!;
        if (r0 + r1 < 1e-6) continue;
        const sx = X[k0]!,
          sy = Y[k0]!,
          ex = X[k1]!,
          ey = Y[k1]!;
        const segLen = Math.hypot(ex - sx, ey - sy);
        const n = Math.max(1, Math.ceil(segLen / 0.5));
        const step = segLen / n;
        for (let a = 0; a < n; a++) {
          const s = (a + 0.5) / n;
          const x = sx + (ex - sx) * s,
            y = sy + (ey - sy) * s;
          const I = (r0 + (r1 - r0) * s) * step * norm * RIM_GAIN;
          const cx0 = Math.floor(x),
            cy0 = Math.floor(y);
          for (let yy = cy0 - rad; yy <= cy0 + rad; yy++) {
            if (yy < 0 || yy >= BH) continue;
            const dy = yy + 0.5 - y;
            for (let xx = cx0 - rad; xx <= cx0 + rad; xx++) {
              if (xx < 0 || xx >= BW) continue;
              const dx = xx + 0.5 - x;
              const g = I * Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
              const o = yy * BW + xx;
              PR[o]! += g * 1.0;
              PG[o]! += g * 0.16;
              PB[o]! += g * 0.12;
            }
          }
        }
      }
    }
  }
  log(`ribbon ${r.name} (${r.layer}) ${(samples / 1e6).toFixed(1)}M samples`);
}

// ---------------------------------------------------------------- the scene
// Phone sits around x ≈ 1.10 to 1.25, y ≈ 0.5 (scene units, height = 1) on common desktop widths; the glass widget
// covers x ≈ 0.33 to 0.81. Ribbons live right of x ≈ 0.8; the left stays near black.

/**
 * A bundle of ribbons braiding along one flow path: each strand is offset sideways by a slow sine, twists at its own
 * rate (every half turn through edge on is a bright fold), and gets its own width, depth layer and seed.
 */
function bundle(o: {
  name: string;
  flow: V3[];
  n: number;
  seed: number;
  spread: number;
  width: [number, number];
  turns: [number, number];
  body: number;
  spec: number;
  rim: number;
  fade: [number, number];
  layers: Ribbon['layer'][];
  cup?: number;
}): Ribbon[] {
  const rnd = mulberry32(o.seed);
  const out: Ribbon[] = [];
  const m = o.flow.length;
  for (let k = 0; k < o.n; k++) {
    const base = (k / Math.max(1, o.n - 1) - 0.5) * o.spread;
    const amp = o.spread * (0.25 + 0.35 * rnd());
    const freq = 0.6 + 0.9 * rnd();
    const phase = rnd() * Math.PI * 2;
    const pts: V3[] = o.flow.map((p, i) => {
      const a = o.flow[Math.max(0, i - 1)]!;
      const b = o.flow[Math.min(m - 1, i + 1)]!;
      const tx = b[0] - a[0],
        ty = b[1] - a[1];
      const l = Math.hypot(tx, ty) || 1;
      const u = i / (m - 1);
      const off = base + amp * Math.sin(2 * Math.PI * freq * u + phase);
      return [p[0] + (-ty / l) * off, p[1] + (tx / l) * off, p[2] + 0.04 * Math.sin(5 * u + phase)];
    });
    const w0 = mix(o.width[0], o.width[1], Math.pow(rnd(), 1.6)); // mostly narrow, the odd wide one
    const width = o.flow.map(
      (_, i) =>
        w0 *
        (0.7 + 0.5 * vnoise(i * 0.9, k * 3.1, o.seed)) *
        mix(0.55, 1, smoothstep(0, 0.35, i / (m - 1))),
    );
    const turns = mix(o.turns[0], o.turns[1], rnd());
    const t0 = rnd() * Math.PI;
    const twist = o.flow.map(
      (_, i) => t0 + turns * Math.PI * (i / (m - 1)) + 0.35 * Math.sin(3 * (i / (m - 1)) + k),
    );
    const cup = o.flow.map(
      (_, i) => (o.cup ?? 0.12) * (0.6 + 0.8 * vnoise(i * 0.7, k * 1.7, o.seed + 5)),
    );
    const layer = o.layers[k % o.layers.length]!;
    out.push({
      name: `${o.name}${k}`,
      layer,
      seed: o.seed * 10 + k,
      pts,
      width,
      twist,
      cup,
      body: o.body * (layer === 'far' ? 0.8 : 1) * (0.7 + 0.6 * rnd()),
      spec: o.spec,
      rim: layer === 'far' ? 0 : o.rim * (0.6 + 0.8 * rnd()),
      fade: o.fade,
    });
  }
  return out;
}

const RIBBONS: Ribbon[] = [
  // Far, soft: a broad dim sheet high on the right, depth behind the main flow.
  {
    name: 'far-top',
    layer: 'far',
    seed: 11,
    pts: [
      [1.3, -0.25, 0],
      [1.5, 0.0, 0.03],
      [1.72, 0.2, 0],
      [1.95, 0.32, -0.03],
      [2.2, 0.36, 0],
    ],
    width: [0.3, 0.4, 0.46, 0.42, 0.36],
    twist: [0.15, 0.3, 0.5, 0.7, 0.9],
    cup: [0.1, 0.12, 0.14, 0.12, 0.1],
    body: 0.05,
    spec: 0.03,
    rim: 0.0,
    fade: [0.2, 0.05],
    hue: CRIMSON,
  },
  // Far, soft: a low sweep under the phone, mostly inside the hero's bottom fade.
  {
    name: 'far-low',
    layer: 'far',
    seed: 23,
    pts: [
      [0.7, 1.25, 0],
      [0.98, 1.04, 0],
      [1.3, 0.94, 0.05],
      [1.62, 0.95, 0],
      [2.0, 0.82, 0],
    ],
    width: [0.3, 0.42, 0.5, 0.45, 0.4],
    twist: [0.2, 0.7, 1.5, 2.1, 2.6],
    cup: [0.2, 0.3, 0.3, 0.3, 0.2],
    body: 0.04,
    spec: 0.03,
    rim: 0.0,
    fade: [0.25, 0.05],
    hue: CRIMSON,
  },
  // The main flow: rises from below the widget gap, passes diagonally behind the phone, leaves through the top right.
  ...bundle({
    name: 'main',
    seed: 37,
    n: 5,
    spread: 0.18,
    width: [0.07, 0.32],
    turns: [0.8, 1.6],
    flow: [
      [0.8, 1.18, 0],
      [0.93, 0.92, 0],
      [1.08, 0.72, 0],
      [1.28, 0.55, 0],
      [1.5, 0.4, 0],
      [1.74, 0.24, 0],
      [1.98, 0.08, 0],
      [2.2, -0.06, 0],
    ],
    body: 0.036,
    spec: 0.2,
    rim: 0.5,
    fade: [0.16, 0.03],
    layers: ['mid', 'near', 'far', 'near', 'mid'],
  }),
  // The counter flow: from the right edge, under the phone, dissolving toward the widget.
  ...bundle({
    name: 'counter',
    seed: 91,
    n: 3,
    spread: 0.1,
    width: [0.06, 0.2],
    turns: [0.7, 1.2],
    flow: [
      [2.15, 0.5, 0],
      [1.9, 0.62, 0],
      [1.64, 0.73, 0],
      [1.38, 0.81, 0],
      [1.12, 0.85, 0],
      [0.88, 0.84, 0],
      [0.68, 0.8, 0],
    ],
    body: 0.028,
    spec: 0.14,
    rim: 0.4,
    fade: [0.04, 0.4],
    layers: ['mid', 'near', 'far'],
  }),
  // Near: a thin bright thread climbing between the widget and the phone, then over the phone's top.
  {
    name: 'thread',
    layer: 'near',
    seed: 71,
    pts: [
      [0.86, 1.02, 0],
      [0.95, 0.76, 0],
      [1.0, 0.46, 0],
      [1.1, 0.22, 0],
      [1.32, 0.1, 0],
      [1.62, 0.07, 0],
      [1.95, 0.11, 0],
    ],
    width: [0.022, 0.03, 0.04, 0.04, 0.035, 0.03, 0.026],
    twist: [0.4, 0.9, 1.4, 1.9, 2.3, 2.6, 2.8],
    body: 0.07,
    spec: 0.28,
    rim: 0.32,
    fade: [0.3, 0.42],
    nv: 16,
  },
];

for (const r of RIBBONS) r.pts = r.pts.map(([x, y, z]) => [x + SHIFT.x, y + SHIFT.y, z]);

// ---------------------------------------------------------------- render

log(`render ${W}x${H}`);
const near = layer(W, H, H);
const mid = layer(W, H, H);
const far = layer(W / 2, H / 2, H / 2);
const ONLY = process.env.ONLY?.split(',');
for (const r of RIBBONS)
  if (!ONLY || ONLY.includes(r.name))
    renderRibbon(r, r.layer === 'far' ? far : r.layer === 'mid' ? mid : near);

blurLayer(far, 0.008 * far.h);
blurLayer(mid, 0.0009 * H);
log('layers blurred');

const img = near;
for (let i = 0; i < img.R.length; i++) {
  img.R[i]! += mid.R[i]!;
  img.G[i]! += mid.G[i]!;
  img.B[i]! += mid.B[i]!;
}
addUpsampled(img, far, 1);

// Background: near black with a faint warm cast, an ambient red glow behind the phone.
for (let y = 0; y < H; y++) {
  const sy = (y + 0.5) / H;
  for (let x = 0; x < W; x++) {
    const sx = (x + 0.5) / H;
    const dx = sx - 1.2 - SHIFT.x,
      dy = sy - 0.5 - SHIFT.y;
    const glow = 0.0065 * Math.exp(-(dx * dx) / (2 * 0.32 * 0.32) - (dy * dy) / (2 * 0.3 * 0.3));
    const i = y * W + x;
    img.R[i]! += 0.0009 + glow;
    img.G[i]! += 0.00045 + glow * 0.05;
    img.B[i]! += 0.00045 + glow * 0.04;
  }
}

// Bloom from a quarter resolution copy: a tight halo and a wide atmospheric one.
{
  const q = downsample(img, 4);
  const q2 = downsample(img, 4);
  blurLayer(q, 0.004 * q.h);
  blurLayer(q2, 0.03 * q2.h);
  addUpsampled(img, q, 0.22);
  addUpsampled(img, q2, 0.18);
  log('bloom');
}

// Vignette, tone map, sRGB, grain and dither.
const rgb = new Uint8Array(W * H * 3);
{
  const rnd = mulberry32(20261016);
  const gauss = () => {
    const u = rnd() || 1e-9;
    const v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  // A softer, clumpier grain layer at half resolution, upsampled, mixed with per pixel grain.
  const gw = Math.ceil(W / 2) + 2,
    gh = Math.ceil(H / 2) + 2;
  const coarse = new Float32Array(gw * gh);
  for (let i = 0; i < coarse.length; i++) coarse[i] = gauss();
  const toSRGB = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  const exposure = 1.1;
  for (let y = 0; y < H; y++) {
    const sy = (y + 0.5) / H;
    for (let x = 0; x < W; x++) {
      const sx = (x + 0.5) / H;
      // Vignette: corners and the bottom edge fall off; the left third is pulled down to keep the copy calm.
      const ex = (sx - ASPECT * 0.62) / (ASPECT * 0.62);
      const ey = (sy - 0.47) / 0.62;
      const vig =
        clamp(1 - 0.55 * Math.pow(ex * ex + ey * ey, 1.35), 0.1, 1) *
        mix(0.55, 1, smoothstep(0.15, 0.85, sx / ASPECT));
      const i = y * W + x;
      let r = img.R[i]! * vig * exposure;
      let g = img.G[i]! * vig * exposure;
      let b = img.B[i]! * vig * exposure;
      // A toe that darkens the mid tones of the ribbon bodies; crests and edge lines keep their full brightness.
      const toe = mix(0.82, 1, smoothstep(0.03, 0.4, r));
      r *= toe;
      g *= toe;
      b *= toe;
      // Filmic shoulder per channel: saturated reds roll into warm pinks only in the hottest highlights.
      r = 1 - Math.exp(-r * 1.1);
      g = 1 - Math.exp(-g * 1.1);
      b = 1 - Math.exp(-b * 1.1);
      let R = toSRGB(r),
        G = toSRGB(g),
        B = toSRGB(b);
      const lum = 0.2126 * R + 0.7152 * G + 0.0722 * B + 0.25 * R;
      const amp = (0.62 * (1.1 + 3.2 * Math.min(1, lum * 2.2) * (1 - lum))) / 255; // grain, kept low: it costs bytes
      const cx = Math.min(gw - 1, x >> 1),
        cy = Math.min(gh - 1, y >> 1);
      const grain = amp * (0.65 * gauss() + 0.55 * coarse[cy * gw + cx]!);
      R += grain;
      G += grain * 0.92;
      B += grain * 0.92;
      const o = i * 3;
      rgb[o] = clamp(Math.round(R * 255 + rnd() - rnd()), 0, 255);
      rgb[o + 1] = clamp(Math.round(G * 255 + rnd() - rnd()), 0, 255);
      rgb[o + 2] = clamp(Math.round(B * 255 + rnd() - rnd()), 0, 255);
    }
  }
  log('tone mapped');
}

// ---------------------------------------------------------------- PNG

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array) {
  const b = Buffer.alloc(12 + data.length);
  b.writeUInt32BE(data.length, 0);
  b.write(type, 4, 'ascii');
  Buffer.from(data).copy(b, 8);
  b.writeUInt32BE(crc32(b.subarray(4, 8 + data.length)), 8 + data.length);
  return b;
}
function encodePNG(w: number, h: number, px: Uint8Array) {
  const stride = w * 3;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    const ro = y * (stride + 1);
    raw[ro] = 4; // Paeth
    for (let x = 0; x < stride; x++) {
      const cur = px[y * stride + x]!;
      const a = x >= 3 ? px[y * stride + x - 3]! : 0;
      const b = y > 0 ? px[(y - 1) * stride + x]! : 0;
      const c = x >= 3 && y > 0 ? px[(y - 1) * stride + x - 3]! : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a),
        pb = Math.abs(p - b),
        pc = Math.abs(p - c);
      const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      raw[ro + 1 + x] = (cur - pred) & 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

function half(px: Uint8Array, w: number, h: number) {
  const w2 = w / 2,
    h2 = h / 2;
  const out = new Uint8Array(w2 * h2 * 3);
  for (let y = 0; y < h2; y++)
    for (let x = 0; x < w2; x++)
      for (let c = 0; c < 3; c++) {
        const a = (2 * y * w + 2 * x) * 3 + c;
        out[(y * w2 + x) * 3 + c] =
          (px[a]! + px[a + 3]! + px[a + w * 3]! + px[a + w * 3 + 3]! + 2) >> 2;
      }
  return out;
}

// ---------------------------------------------------------------- write

/** JPEG through macOS sips at a quality from 0 to 100; returns the size in bytes. */
function jpeg(png: string, out: string, quality: number) {
  execFileSync(
    'sips',
    ['-s', 'format', 'jpeg', '-s', 'formatOptions', String(quality), png, '--out', out],
    { stdio: 'ignore' },
  );
  return fs.statSync(out).size;
}
const kb = (n: number) => `${Math.round(n / 1024)} KB`;

if (QUICK) {
  fs.writeFileSync(path.join(OUT, 'hero-bg-quick.png'), encodePNG(W, H, rgb));
  log(`wrote ${path.join(OUT, 'hero-bg-quick.png')}`);
} else {
  const big = path.join(OUT, 'hero-bg-3840.png');
  const small = path.join(OUT, 'hero-bg-1920.png');
  fs.writeFileSync(big, encodePNG(W, H, rgb));
  fs.writeFileSync(small, encodePNG(W / 2, H / 2, half(rgb, W, H)));
  log(`wrote ${big} and ${small}`);
  // Retina and wide screens get the 4K file (target ≤ 1.6 MB), phones and 1× screens the 1920 one (≤ 450 KB).
  log(
    `hero-bg-3840.jpg ${kb(jpeg(big, path.join(ASSETS, 'hero-bg-3840.jpg'), Number(process.env.Q4K ?? 95)))}`,
  );
  log(
    `hero-bg-1920.jpg ${kb(jpeg(small, path.join(ASSETS, 'hero-bg-1920.jpg'), Number(process.env.Q2K ?? 94)))}`,
  );
}
log('done');
