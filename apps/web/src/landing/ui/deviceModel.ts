// Geometry and light for DeviceFrame: a 6.3 inch Pro class phone drawn by us (no Apple artwork, no logo).
// Units are display pixels of the 1206 × 2622 screenshots at 460 ppi (18.11 per mm), so the screen maps 1:1.
// Body 71.9 × 150 × 8.75 mm, continuous (squircle) corners, a thin metal rim around the glass, an even black
// border, the island, and buttons as slight protrusions. Colors of the metal are computed, not picked: every
// facet of the band is shaded from a small studio (a softbox, two tall strips, two kickers behind, a red
// backdrop) with the same rotation the CSS applies, so highlights move with the tilt like on a product shot.
// The front rim is a stack of conic gradient bands, the side walls and buttons are CSS 3D planes.

export type Finish = 'natural' | 'black';
type Vec3 = [number, number, number];
type Mat3 = [Vec3, Vec3, Vec3];
interface Pt {
  x: number;
  y: number;
}

export const MM = 460 / 25.4;
export const BODY = { w: 1302, h: 2716, r: 234, t: Math.round(8.75 * MM) } as const;
/** Metal seen from the front, from the silhouette to the glass edge. */
export const RIM = 22;
export const SCREEN = { x: 48, y: 47, w: 1206, h: 2622, r: 186 } as const;
/** The island as the simulator draws it on a 1206 × 2622 screen, in body units. */
export const ISLAND = { x: 48 + 415, y: 47 + 42, w: 376, h: 110 } as const;
const SMOOTHING = 0.6;

/** Buttons: side, center and length along the edge in mm from the top, how far they stand out (units). */
const KEYS = [
  { side: -1, at: 34, len: 7.5, out: 9 }, // action button
  { side: -1, at: 50, len: 12.5, out: 10 }, // volume up
  { side: -1, at: 66, len: 12.5, out: 10 }, // volume down
  { side: 1, at: 57, len: 17, out: 10 }, // side button
] as const;
/** Camera control: flush sapphire on the right edge. */
const CAMERA_CONTROL = { at: 103, len: 16.5 } as const;
const KEY_DEPTH = 52;

// Squircle (continuous corners), after the figma-squircle construction: cubic, arc, cubic per corner.

const rad = (deg: number) => (deg * Math.PI) / 180;
const r2 = (n: number) => Math.round(n * 100) / 100;

function corner(r: number, budget: number, smoothing = SMOOTHING) {
  let p = (1 + smoothing) * r;
  const s = Math.min(smoothing, budget / r - 1);
  p = Math.min(p, budget);
  const arcMeasure = 90 * (1 - s);
  const arc = Math.sin(rad(arcMeasure / 2)) * r * Math.SQRT2;
  const alpha = (90 - arcMeasure) / 2;
  const p3p4 = r * Math.tan(rad(alpha / 2));
  const beta = 45 * s;
  const c = p3p4 * Math.cos(rad(beta));
  const d = c * Math.tan(rad(beta));
  const b = (p - arc - c - d) / 3;
  return { a: 2 * b, b, c, d, p, arc, r };
}

/** SVG path of a rounded rectangle with continuous corners. */
export function squircle(x: number, y: number, w: number, h: number, r: number): string {
  const { a, b, c, d, p, arc } = corner(r, Math.min(w, h) / 2);
  const n = (v: number) => String(r2(v));
  const ab = a + b;
  const abc = a + b + c;
  const bc = b + c;
  return [
    `M${n(x + w - p)} ${n(y)}`,
    `c${n(a)} 0 ${n(ab)} 0 ${n(abc)} ${n(d)}`,
    `a${n(r)} ${n(r)} 0 0 1 ${n(arc)} ${n(arc)}`,
    `c${n(d)} ${n(c)} ${n(d)} ${n(bc)} ${n(d)} ${n(abc)}`,
    `L${n(x + w)} ${n(y + h - p)}`,
    `c0 ${n(a)} 0 ${n(ab)} ${n(-d)} ${n(abc)}`,
    `a${n(r)} ${n(r)} 0 0 1 ${n(-arc)} ${n(arc)}`,
    `c${n(-c)} ${n(d)} ${n(-bc)} ${n(d)} ${n(-abc)} ${n(d)}`,
    `L${n(x + p)} ${n(y + h)}`,
    `c${n(-a)} 0 ${n(-ab)} 0 ${n(-abc)} ${n(-d)}`,
    `a${n(r)} ${n(r)} 0 0 1 ${n(-arc)} ${n(-arc)}`,
    `c${n(-d)} ${n(-c)} ${n(-d)} ${n(-bc)} ${n(-d)} ${n(-abc)}`,
    `L${n(x)} ${n(y + p)}`,
    `c0 ${n(-a)} 0 ${n(-ab)} ${n(d)} ${n(-abc)}`,
    `a${n(r)} ${n(r)} 0 0 1 ${n(arc)} ${n(-arc)}`,
    `c${n(c)} ${n(-d)} ${n(bc)} ${n(-d)} ${n(abc)} ${n(-d)}`,
    'Z',
  ].join('');
}

/** Points of the top left corner from (0, p) to (p, 0), evenly spaced along the curve. */
function cornerPoints(r: number, budget: number, count: number): Pt[] {
  const { a, b, c, d, p, arc } = corner(r, budget);
  const cubic = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt => {
    const u = 1 - t;
    return {
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    };
  };
  const p0 = { x: 0, y: p };
  const p3 = { x: d, y: p - a - b - c };
  const p4 = { x: p3.x + arc, y: p3.y - arc };
  const p5 = { x: p, y: 0 };
  // The arc lies on the circle of radius r inside the corner; take the center nearer to (r, r).
  const mx = (p3.x + p4.x) / 2;
  const my = (p3.y + p4.y) / 2;
  const half = Math.hypot(p4.x - p3.x, p4.y - p3.y) / 2;
  const q = Math.sqrt(Math.max(r * r - half * half, 0));
  const ux = (p4.x - p3.x) / (2 * half);
  const uy = (p4.y - p3.y) / (2 * half);
  const centers = [
    { x: mx - uy * q, y: my + ux * q },
    { x: mx + uy * q, y: my - ux * q },
  ];
  const cc = centers.sort(
    (m, n) => Math.hypot(m.x - r, m.y - r) - Math.hypot(n.x - r, n.y - r),
  )[0]!;
  const a0 = Math.atan2(p3.y - cc.y, p3.x - cc.x);
  let a1 = Math.atan2(p4.y - cc.y, p4.x - cc.x);
  if (a1 - a0 > Math.PI) a1 -= 2 * Math.PI;
  if (a0 - a1 > Math.PI) a1 += 2 * Math.PI;

  const dense: Pt[] = [];
  const N = 60;
  for (let i = 0; i < N; i++)
    dense.push(cubic(p0, { x: 0, y: p - a }, { x: 0, y: p - a - b }, p3, i / N));
  for (let i = 0; i < N; i++) {
    const t = a0 + ((a1 - a0) * i) / N;
    dense.push({ x: cc.x + r * Math.cos(t), y: cc.y + r * Math.sin(t) });
  }
  for (let i = 0; i <= N; i++) {
    dense.push(
      cubic(p4, { x: p4.x + c, y: p4.y - d }, { x: p4.x + b + c, y: p4.y - d }, p5, i / N),
    );
  }
  const lens = [0];
  for (let i = 1; i < dense.length; i++) {
    lens.push(
      lens[i - 1]! + Math.hypot(dense[i]!.x - dense[i - 1]!.x, dense[i]!.y - dense[i - 1]!.y),
    );
  }
  const total = lens[lens.length - 1]!;
  const out: Pt[] = [];
  let j = 0;
  for (let k = 0; k <= count; k++) {
    const target = (total * k) / count;
    while (j < lens.length - 2 && lens[j + 1]! < target) j++;
    const f = (target - lens[j]!) / (lens[j + 1]! - lens[j]! || 1);
    out.push({
      x: dense[j]!.x + (dense[j + 1]!.x - dense[j]!.x) * f,
      y: dense[j]!.y + (dense[j + 1]!.y - dense[j]!.y) * f,
    });
  }
  return out;
}

/**
 * The body outline as vertices running counterclockwise on screen (top edge right to left first), each with its
 * outward normal. Straight edges are split so the light can change along them.
 */
function outline(perCorner: number, perLong: number, perShort: number) {
  const { w, h, r } = BODY;
  const tl = cornerPoints(r, Math.min(w, h) / 2, perCorner);
  const p = tl[0]!.y;
  const line = (from: Pt, to: Pt, parts: number): Pt[] =>
    Array.from({ length: parts - 1 }, (_, i) => ({
      x: from.x + ((to.x - from.x) * (i + 1)) / parts,
      y: from.y + ((to.y - from.y) * (i + 1)) / parts,
    }));
  // Clockwise first (top left corner, top edge, …), then reversed.
  const cw: Pt[] = [];
  cw.push(...tl);
  cw.push(...line({ x: p, y: 0 }, { x: w - p, y: 0 }, perShort));
  cw.push(...[...tl].reverse().map((q) => ({ x: w - q.x, y: q.y })));
  cw.push(...line({ x: w, y: p }, { x: w, y: h - p }, perLong));
  cw.push(...tl.map((q) => ({ x: w - q.x, y: h - q.y })));
  cw.push(...line({ x: w - p, y: h }, { x: p, y: h }, perShort));
  cw.push(...[...tl].reverse().map((q) => ({ x: q.x, y: h - q.y })));
  cw.push(...line({ x: 0, y: h - p }, { x: 0, y: p }, perLong));
  const pts = cw.reverse().filter((q, i, all) => {
    const prev = all[(i - 1 + all.length) % all.length]!;
    return Math.hypot(q.x - prev.x, q.y - prev.y) > 0.01;
  });
  const segNormal = (m: Pt, n: Pt): Pt => {
    const dx = n.x - m.x;
    const dy = n.y - m.y;
    const len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len;
    let ny = dx / len;
    const cx = (m.x + n.x) / 2 - w / 2;
    const cy = (m.y + n.y) / 2 - h / 2;
    if (nx * cx + ny * cy < 0) {
      nx = -nx;
      ny = -ny;
    }
    return { x: nx, y: ny };
  };
  return pts.map((q, i) => {
    const next = pts[(i + 1) % pts.length]!;
    const prev = pts[(i - 1 + pts.length) % pts.length]!;
    const n1 = segNormal(prev, q);
    const n2 = segNormal(q, next);
    const nx = n1.x + n2.x;
    const ny = n1.y + n2.y;
    const len = Math.hypot(nx, ny) || 1;
    return { ...q, n: { x: nx / len, y: ny / len }, seg: n2, next };
  });
}

// Light: a small studio around the phone. World axes follow CSS: x right, y down, z toward the viewer.

const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const dot = (m: Vec3, n: Vec3) => m[0] * n[0] + m[1] * n[1] + m[2] * n[2];
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
};
const mul = (m: Mat3, v: Vec3): Vec3 => [dot(m[0], v), dot(m[1], v), dot(m[2], v)];
const matMul = (m: Mat3, n: Mat3): Mat3 =>
  [0, 1, 2].map((i) =>
    [0, 1, 2].map((j) => m[i]![0] * n[0][j]! + m[i]![1] * n[1][j]! + m[i]![2] * n[2][j]!),
  ) as Mat3;

/** The matrix of CSS `rotateX(x) rotateY(y) rotateZ(z)` (degrees). */
function rotation(x: number, y: number, z: number): Mat3 {
  const [cx, sx, cy, sy, cz, sz] = [
    Math.cos(rad(x)),
    Math.sin(rad(x)),
    Math.cos(rad(y)),
    Math.sin(rad(y)),
    Math.cos(rad(z)),
    Math.sin(rad(z)),
  ];
  const rx: Mat3 = [
    [1, 0, 0],
    [0, cx, -sx],
    [0, sx, cx],
  ];
  const ry: Mat3 = [
    [cy, 0, sy],
    [0, 1, 0],
    [-sy, 0, cy],
  ];
  const rz: Mat3 = [
    [cz, -sz, 0],
    [sz, cz, 0],
    [0, 0, 1],
  ];
  return matMul(matMul(rx, ry), rz);
}

/**
 * The studio, in body units around the phone's center (x right, y down, z toward the viewer). Each lamp is an area
 * light at a position, so what an edge reflects depends on where along the edge it is: highlights run as gradients
 * along the band, as on a photographed phone. `wa` and `we` are the lamp's half size in degrees across and along.
 */
interface Lamp {
  pos: Vec3;
  power: number;
  wa: number;
  we: number;
}

const LAMPS: Lamp[] = [
  { pos: [-4200, -5200, 5200], power: 1.35, wa: 26, we: 18 }, // large softbox, up left, in front
  { pos: [-6400, -900, 2600], power: 1.05, wa: 5.5, we: 30 }, // tall strip on the left
  { pos: [6400, -500, 2300], power: 1.3, wa: 4.5, we: 32 }, // tall strip on the right
  { pos: [-3830, -2600, -5680], power: 1.05, wa: 18, we: 14 }, // kicker behind on the left
  { pos: [3830, -1000, -5680], power: 0.75, wa: 16, we: 18 }, // kicker behind on the right
  { pos: [0, -7000, 1200], power: 0.5, wa: 50, we: 12 }, // overhead fill
];

interface Material {
  tint: Vec3;
  ambient: number;
  f0: number;
  /** Satin finish: reflections blurred by this many degrees, so rounded edges stay lit instead of going black. */
  satin: number;
}

const MATERIALS: Record<Finish, Material> = {
  natural: { tint: [0.85, 0.835, 0.8], ambient: 0.2, f0: 0.72, satin: 12 },
  black: { tint: [0.33, 0.33, 0.345], ambient: 0.07, f0: 0.4, satin: 9 },
};

const azEl = (v: Vec3): [number, number] => [
  Math.atan2(v[0], v[2]),
  Math.asin(Math.max(-1, Math.min(1, -v[1]))),
];

/** Light reaching the eye along the mirror direction `r` from a point `p` of the band. */
function env(r: Vec3, p: Vec3, rim: boolean, satin: number): Vec3 {
  const [ar, er] = azEl(r);
  let white = 0.035 + 0.07 * smooth(0.3, 1, r[2]);
  for (const L of LAMPS) {
    const [al, el] = azEl(norm([L.pos[0] - p[0], L.pos[1] - p[1], L.pos[2] - p[2]]));
    let da = ar - al;
    if (da > Math.PI) da -= 2 * Math.PI;
    if (da < -Math.PI) da += 2 * Math.PI;
    const wa = L.wa + satin;
    const we = L.we + satin;
    const dist = Math.hypot((da * Math.cos((er + el) / 2)) / rad(wa), (er - el) / rad(we));
    white += L.power * Math.sqrt((L.wa * L.we) / (wa * we)) * (1 - smooth(0.35, 1.15, dist));
  }
  // The floor and the dark room below the lamps.
  white *= 1 - 0.55 * smooth(0.1, 0.8, r[1]);
  if (!rim) return [white, white, white * 1.01];
  // A faint warm rim: the red backdrop behind the phone, stronger toward the right where the wallpaper glows.
  const red = 0.09 * smooth(0, -0.75, r[2]) * (0.5 + 0.5 * smooth(-0.6, 0.6, r[0]));
  return [white + red, white + 0.22 * red, white + 0.16 * red];
}

const tone = (v: number) => {
  const c = v < 0.82 ? v : 0.82 + 0.18 * (1 - Math.exp(-(v - 0.82) / 0.18));
  return Math.round(Math.min(Math.max(c, 0), 1) * 255);
};
const css = (c: Vec3) => `rgb(${tone(c[0])} ${tone(c[1])} ${tone(c[2])})`;
const hex = (c: Vec3) => `#${c.map((v) => tone(v).toString(16).padStart(2, '0')).join('')}`;

interface Light {
  m: Mat3;
  eye: Vec3;
  mat: Material;
  rim: boolean;
}

/** Color of the metal at a body point (units, z ≤ 0 into the phone) with a body space normal. */
function shade(L: Light, x: number, y: number, z: number, n: Vec3): Vec3 {
  const p = mul(L.m, [x - BODY.w / 2, y - BODY.h / 2, z]);
  const nw = norm(mul(L.m, n));
  const v = norm([L.eye[0] - p[0], L.eye[1] - p[1], L.eye[2] - p[2]]);
  const ndv = dot(nw, v);
  const r: Vec3 = [2 * ndv * nw[0] - v[0], 2 * ndv * nw[1] - v[1], 2 * ndv * nw[2] - v[2]];
  const e = env(r, p, L.rim, L.mat.satin);
  const g = Math.pow(1 - Math.min(Math.max(ndv, 0), 1), 5);
  const f = L.mat.f0 + (1 - L.mat.f0) * g;
  return [0, 1, 2].map((i) => {
    const tint = L.mat.tint[i]!;
    const specular = tint + (1 - tint) * g;
    return tint * L.mat.ambient + specular * f * e[i]!;
  }) as Vec3;
}

/** A normal that turns from facing the viewer (deg 0) to facing out of the edge (90) to the back (180). */
const edgeNormal = (n: Pt, deg: number): Vec3 => [
  Math.sin(rad(deg)) * n.x,
  Math.sin(rad(deg)) * n.y,
  Math.cos(rad(deg)),
];

/**
 * The rim seen from the front, from the glass edge (u = 0) to the silhouette (u = 1): a nearly flat polished lip,
 * then a quarter round into the side. Returns the angle of the normal from the viewer, in degrees.
 */
const LIP = 0.34;
const rimDeg = (u: number) =>
  u < LIP ? 3 + (5 * u) / LIP : Math.max(8, (Math.asin(Math.min((u - LIP) / (1 - LIP), 1)) * 180) / Math.PI);

/**
 * The rim is drawn as concentric bands, outermost first, each a filled squircle out to `outer` (painted over by the
 * next one) with a conic gradient sampled along the outline: smooth around the corners at a few DOM nodes.
 */
const BAND_EDGES = [1, 0.985, 0.965, 0.94, 0.91, 0.87, 0.82, 0.76, 0.68, 0.58, 0.46, 0.3, 0.12];
const BANDS = BAND_EDGES.map((outer, i) => ({ outer, at: (outer + (BAND_EDGES[i + 1] ?? 0)) / 2 }));

/** CSS masks of the bands (their squircles), shared by every instance. */
export const RIM_BAND_MASKS = BANDS.map(({ outer }) => {
  const d = RIM * (1 - outer);
  const path = squircle(d, d, BODY.w - 2 * d, BODY.h - 2 * d, BODY.r - d);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BODY.w} ${BODY.h}" preserveAspectRatio="none"><path d="${path}"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
});

/** The side wall from the front edge (0) to the back (1): position and normal angle. */
const WALL_PROFILE: [number, number][] = [
  [0, 86],
  [0.035, 90],
  [0.5, 90],
  [0.84, 90],
  [0.9, 112],
  [0.95, 134],
  [1, 158],
];

/** A button's outer face across its depth: rounded front and back edges. */
const KEY_PROFILE: [number, number][] = [
  [0, 48],
  [0.14, 78],
  [0.3, 90],
  [0.7, 90],
  [0.86, 102],
  [1, 132],
];

export interface Tilt {
  /** rotateX, degrees. */
  x?: number;
  /** rotateY, degrees: positive turns the left edge toward the viewer. */
  y?: number;
  /** rotateZ, degrees. */
  z?: number;
  /** CSS perspective in px, default 1600. */
  perspective?: number;
}

export interface GradientStop {
  o: number;
  c: string;
}

export interface Wall {
  x: number;
  y: number;
  z: number;
  len: number;
  depth: number;
  angle: number;
  background: string;
  radius?: number;
  /** Inset ring color (the camera control's metal frame). */
  ring?: string;
}

export interface Key2d {
  x: number;
  y: number;
  w: number;
  h: number;
  x1: number;
  x2: number;
  stops: GradientStop[];
}

export interface DeviceModel {
  /** Backgrounds of the rim bands, in the order of RIM_BAND_MASKS. */
  rim: string[];
  walls: Wall[];
  caps: Wall[];
  keys: Key2d[];
  sheenShift: number;
}

const stopsCss = (stops: GradientStop[]) => stops.map((s) => `${s.c} ${r2(s.o * 100)}%`).join(', ');

/**
 * Everything the component draws for one pose. `eye` is the viewer's distance in body units: the CSS perspective
 * divided by the size of a unit, so reflections line up with the projection the browser draws.
 */
export function buildModel(
  finish: Finish,
  rimLight: boolean,
  tilt: Tilt | undefined,
  solid: boolean,
  eye = 4.2 * BODY.h,
): DeviceModel {
  const tx = tilt?.x ?? 0;
  const ty = tilt?.y ?? 0;
  const tz = tilt?.z ?? 0;
  const L: Light = {
    m: rotation(tx, ty, tz),
    eye: [0, 0, eye],
    mat: MATERIALS[finish],
    rim: rimLight,
  };

  // Front rim: per band, the color at points along its outline, placed by their angle around the center.
  const ring = outline(20, 6, 3);
  const rim = BANDS.map(({ at }) => {
    const d = RIM * (1 - at);
    const deg = rimDeg(at);
    const stops = ring
      .map((q) => {
        const x = q.x - q.n.x * d;
        const y = q.y - q.n.y * d;
        const a = (Math.atan2(x - BODY.w / 2, BODY.h / 2 - y) * 180) / Math.PI;
        return { a: (a + 360) % 360, c: hex(shade(L, x, y, 0, edgeNormal(q.n, deg))) };
      })
      .sort((m, n) => m.a - n.a);
    const first = stops[0]!;
    const last = stops[stops.length - 1]!;
    const list = [{ a: last.a - 360, c: last.c }, ...stops, { a: first.a + 360, c: first.c }];
    return `conic-gradient(${list.map((t) => `${t.c} ${r2(t.a)}deg`).join(',')})`;
  });

  // Side walls and 3D buttons, only for a tilted phone.
  const walls: Wall[] = [];
  const caps: Wall[] = [];
  if (solid) {
    const edge = outline(18, 28, 3);
    for (const q of edge) {
      // Walls turned away from the viewer are hidden by the browser anyway; leave them out of the DOM.
      if (mul(L.m, [q.seg.x, q.seg.y, 0])[2] < -0.12) continue;
      const dx = q.next.x - q.x;
      const dy = q.next.y - q.y;
      const len = Math.hypot(dx, dy);
      const e = 0.8;
      const mx = (q.x + q.next.x) / 2;
      const my = (q.y + q.next.y) / 2;
      const stops = WALL_PROFILE.map(([w, deg]) => ({
        o: w,
        c: css(shade(L, mx, my, -w * BODY.t, edgeNormal(q.seg, deg))),
      }));
      walls.push({
        x: r2(q.x - (dx / len) * e),
        y: r2(q.y - (dy / len) * e),
        z: 0,
        len: r2(len + 2 * e),
        depth: BODY.t,
        angle: r2((Math.atan2(dy, dx) * 180) / Math.PI),
        background: `linear-gradient(to bottom, ${stopsCss(stops)})`,
      });
    }
    const zFront = -(BODY.t - KEY_DEPTH) / 2;
    const facing = (side: number) => mul(L.m, [side, 0, 0])[2] > -0.12;
    for (const k of KEYS) {
      if (!facing(k.side)) continue;
      const y0 = (k.at - k.len / 2) * MM;
      const y1 = (k.at + k.len / 2) * MM;
      const n: Pt = { x: k.side, y: 0 };
      const x = k.side < 0 ? -k.out : BODY.w + k.out;
      const face = KEY_PROFILE.map(([w, deg]) => ({
        o: w,
        c: css(shade(L, x, (y0 + y1) / 2, zFront - w * KEY_DEPTH, edgeNormal(n, deg))),
      }));
      walls.push({
        x: r2(x),
        y: r2(k.side < 0 ? y0 : y1),
        z: r2(zFront),
        len: r2(y1 - y0),
        depth: KEY_DEPTH,
        angle: k.side < 0 ? 90 : -90,
        background: `linear-gradient(to bottom, ${stopsCss(face)})`,
        radius: KEY_DEPTH / 2,
      });
      // The button's front side, from the seam at the wall (dark) to its rounded outer edge.
      const cap = [0, 0.45, 0.86, 1].map((w) => {
        const out = k.side < 0 ? 1 - w : w;
        const c = shade(L, x, (y0 + y1) / 2, zFront, edgeNormal(n, 76 + 14 * out));
        const seam = out < 0.05 ? 0.35 : 1;
        return { o: w, c: css([c[0] * seam, c[1] * seam, c[2] * seam]) };
      });
      caps.push({
        x: r2(k.side < 0 ? -k.out : BODY.w),
        y: r2(y0),
        z: r2(zFront),
        len: k.out,
        depth: r2(y1 - y0),
        angle: 0,
        background: `linear-gradient(to right, ${stopsCss(cap)})`,
        radius: k.out / 2,
      });
    }
    // Camera control: a sapphire window set flush into the right edge, just proud of the wall to avoid z-fighting.
    const cy0 = (CAMERA_CONTROL.at - CAMERA_CONTROL.len / 2) * MM;
    const cy1 = (CAMERA_CONTROL.at + CAMERA_CONTROL.len / 2) * MM;
    const metal = css(shade(L, BODY.w, (cy0 + cy1) / 2, -BODY.t / 2, [1, 0, 0]));
    const glass = css(
      shade({ ...L, mat: MATERIALS.black }, BODY.w, (cy0 + cy1) / 2, -BODY.t / 2, [1, 0, 0]),
    );
    if (facing(1))
      walls.push({
        x: BODY.w + 1.5,
        y: r2(cy1),
        z: r2(-(BODY.t - 46) / 2),
        len: r2(cy1 - cy0),
        depth: 46,
        angle: -90,
        background: `radial-gradient(120% 140% at 50% 25%, rgb(255 255 255 / 0.12), transparent 60%), ${glass}`,
        radius: 23,
        ring: metal,
      });
  }

  // Buttons seen straight on: slight bumps past the silhouette, lit like the front of the rim.
  const keys: Key2d[] = KEYS.map((k) => {
    const y0 = (k.at - k.len / 2) * MM;
    const y1 = (k.at + k.len / 2) * MM;
    const n: Pt = { x: k.side, y: 0 };
    const xo = k.side < 0 ? -k.out : BODY.w + k.out;
    const xi = k.side < 0 ? 6 : BODY.w - 6;
    const stops = [0, 0.35, 0.65, 0.85, 1].map((u) => ({
      o: u,
      c: css(shade(L, xi + (xo - xi) * u, (y0 + y1) / 2, -BODY.t / 2, edgeNormal(n, 25 + 65 * u))),
    }));
    return {
      x: r2(Math.min(xo, xi)),
      y: r2(y0),
      w: r2(Math.abs(xo - xi)),
      h: r2(y1 - y0),
      x1: r2(xi),
      x2: r2(xo),
      stops,
    };
  });

  return {
    rim,
    walls,
    caps,
    keys,
    sheenShift: r2(Math.max(-0.25, Math.min(0.25, ty / 90 + tx / 160))),
  };
}
