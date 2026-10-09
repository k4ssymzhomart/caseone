// Shared by the hero background generators (tools/gen-hero-bg.ts, the dark silk, and tools/gen-hero-bg-light.ts, the
// light satin): deterministic math and noise, Catmull Rom curves, linear float layers with gaussian blur, the ribbon
// mesh (a centre line with width, twist and cup), and a lossless PNG writer. Node built ins only.
import zlib from 'node:zlib';
// ---------------------------------------------------------------- math helpers

export type V3 = [number, number, number];
export const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(ix: number, iy: number, seed: number) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1]. */
export function vnoise(x: number, y: number, seed: number) {
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

export function fbm(x: number, y: number, seed: number) {
  return (
    0.55 * vnoise(x, y, seed) +
    0.3 * vnoise(x * 2.03, y * 2.03, seed + 17) +
    0.15 * vnoise(x * 4.1, y * 4.1, seed + 41)
  );
}

/** Uniform Catmull Rom through scalar control values spread evenly over u in [0, 1]. */
export function crScalar(vals: number[], u: number) {
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

/**
 * Uniform cubic B spline over scalar control values spread evenly over u in [0, 1], ends clamped by repetition. It
 * only approximates the control values but is C2, so a shaded sheet shows no crease at the knots.
 */
export function bsScalar(vals: number[], u: number) {
  const n = vals.length;
  if (n === 1) return vals[0]!;
  const t = clamp(u, 0, 1) * (n - 1);
  const i = Math.min(Math.floor(t), n - 2);
  const f = t - i;
  const p0 = vals[Math.max(i - 1, 0)]!;
  const p1 = vals[i]!;
  const p2 = vals[i + 1]!;
  const p3 = vals[Math.min(i + 2, n - 1)]!;
  const f2 = f * f;
  const f3 = f2 * f;
  return (
    ((1 - f) * (1 - f) * (1 - f) * p0 +
      (3 * f3 - 6 * f2 + 4) * p1 +
      (-3 * f3 + 3 * f2 + 3 * f + 1) * p2 +
      f3 * p3) /
    6
  );
}

export function crPoint(pts: V3[], u: number): V3 {
  return [0, 1, 2].map((k) =>
    crScalar(
      pts.map((p) => p[k]!),
      u,
    ),
  ) as V3;
}

export const norm3 = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
export const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// ---------------------------------------------------------------- linear RGB float layers

export type Layer = {
  w: number;
  h: number;
  scale: number;
  R: Float32Array;
  G: Float32Array;
  B: Float32Array;
};
export function layer(w: number, h: number, scale: number): Layer {
  const n = w * h;
  return { w, h, scale, R: new Float32Array(n), G: new Float32Array(n), B: new Float32Array(n) };
}

export function boxesForGauss(sigma: number, n = 3) {
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  return Array.from({ length: n }, (_, i) => ((i < m ? wl : wu) - 1) / 2);
}

export function blurLine(
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

export function blurPlane(p: Float32Array, w: number, h: number, sigma: number) {
  if (sigma < 0.3) return;
  const tmp = new Float32Array(p.length);
  for (const r0 of boxesForGauss(sigma)) {
    const r = Math.max(0, Math.round(r0));
    if (r === 0) continue;
    for (let y = 0; y < h; y++) blurLine(p, tmp, y * w, 1, w, r);
    for (let x = 0; x < w; x++) blurLine(tmp, p, x, w, h, r);
  }
}
export function blurLayer(L: Layer, sigma: number) {
  for (const p of [L.R, L.G, L.B]) blurPlane(p, L.w, L.h, sigma);
}

/** Bilinear sample of a plane at continuous pixel coords (pixel centres at i + 0.5). */
export function sampleBilinear(p: Float32Array, w: number, h: number, x: number, y: number) {
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
export function addUpsampled(dst: Layer, src: Layer, k: number) {
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

export function downsample(src: Layer, f: number): Layer {
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

// ---------------------------------------------------------------- PNG

export const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(buf: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export function chunk(type: string, data: Uint8Array) {
  const b = Buffer.alloc(12 + data.length);
  b.writeUInt32BE(data.length, 0);
  b.write(type, 4, 'ascii');
  Buffer.from(data).copy(b, 8);
  b.writeUInt32BE(crc32(b.subarray(4, 8 + data.length)), 8 + data.length);
  return b;
}
export function encodePNG(w: number, h: number, px: Uint8Array) {
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

export function half(px: Uint8Array, w: number, h: number) {
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

// ---------------------------------------------------------------- ribbon mesh

export type RibbonShape = {
  pts: V3[]; // centre line in scene units (z shapes the normals and, for opaque sheets, the depth order)
  width: number[]; // control values over u, scene units
  twist: number[]; // radians over u; ±π/2 is edge on, which folds the sheet
  cup?: number[]; // cross section curvature over u (sheet bends like fabric), fraction of width
  spline?: 'catmull' | 'bspline'; // through the control values (default), or C2 smooth near them
};

/**
 * Samples a ribbon into an (nu + 1) × (nv + 1) grid of points scaled by `scale` (pixels per scene unit); vertex
 * k = i · (nv + 1) + j sits at u = i / nu along the centre line and v = j / nv across the width.
 */
export function ribbonMesh(r: RibbonShape, nu: number, nv: number, scale: number) {
  const cols = nv + 1;
  const N = (nu + 1) * cols;
  const X = new Float64Array(N);
  const Y = new Float64Array(N);
  const Z = new Float64Array(N);
  const scalar = r.spline === 'bspline' ? bsScalar : crScalar;
  const point = (u: number) =>
    [0, 1, 2].map((k) =>
      scalar(
        r.pts.map((p) => p[k]!),
        u,
      ),
    ) as V3;
  for (let i = 0; i <= nu; i++) {
    const u = i / nu;
    const C = point(u);
    const e = 1e-3;
    const a = point(Math.max(0, u - e));
    const b = point(Math.min(1, u + e));
    const T = norm3([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    const N1 = norm3([T[1], -T[0], 0]);
    const N2 = cross(T, N1);
    const phi = scalar(r.twist, u);
    const w = Math.max(0, scalar(r.width, u));
    const d: V3 = [
      Math.cos(phi) * N1[0] + Math.sin(phi) * N2[0],
      Math.cos(phi) * N1[1] + Math.sin(phi) * N2[1],
      Math.cos(phi) * N1[2] + Math.sin(phi) * N2[2],
    ];
    const dp = cross(T, d); // perpendicular to the sheet at the centre line
    const cup = r.cup ? scalar(r.cup, u) : 0;
    for (let j = 0; j <= nv; j++) {
      const v = j / nv - 0.5;
      const k = i * cols + j;
      const bend = cup * w * (4 * v * v - 1 / 3);
      X[k] = (C[0] + v * w * d[0] + bend * dp[0]) * scale;
      Y[k] = (C[1] + v * w * d[1] + bend * dp[1]) * scale;
      Z[k] = (C[2] + v * w * d[2] + bend * dp[2]) * scale;
    }
  }
  return { X, Y, Z, cols, N };
}
