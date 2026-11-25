import { baseHeight, roadWeight } from '../core/world/terrain';
import { buildingTreads, onSupport } from '../core/world/buildingEntries';
import { shoreDistance } from '../core/world/coast';
import type { V2 } from '../core/world/layout';
import { sites } from './doorways';
import { crossings, crossingLocal, deckAt, deckHeight, pickDeck } from './crossing';
import { waterProfile } from './channels';
import { project, unproject, PROJECTION, risePixels } from './projection';

// Each cell is two planar triangles sharing the NW–SE diagonal. Picking and rasterization walk those same faces.
const step = 2,
  ceiling = 22;
export const footingHeight = 0.52;
const heights = new Map<number, number>();
const clamp = (x: number) => Math.max(0, Math.min(1, x));
function smooth(a: number, b: number, x: number) {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
const shelves = [
  // Exposed benches beside the woodland road, above the ford and along the old quarry cut.
  [-238, 13, 16, 8, -0.48, 3.2],
  [-201, -17, 16, 10, 0.3, 4.1],
  [-149, 36, 17, 11, -0.45, 4.8],
  [-94, 47, 13, 8, 0.6, 3.3],
  [24, -16, 11, 7, -0.55, 2.5],
  [47, 16, 9, 7, 0.64, 2.7],
  [-21, -67, 12, 7, -0.7, 3.5],
  [103, -41, 18, 8, -0.34, 6.3],
  [79, -44, 12, 7, -0.52, 3.8],
  [120, -50, 13, 8, -0.28, 4.9],
] as const;
function landform(x: number, z: number) {
  const wet = waterProfile(x, z);
  if (wet && wet.bank > -1.4) return 0;
  let h = Math.max(0, baseHeight(x, z)) * 1.28;
  let extra = 0;
  const ripple = 0.08 * Math.sin(x * 0.57 + z * 0.31) + 0.035 * Math.cos(z * 0.93 - x * 0.27);
  for (const [cx, cz, rx, rz, yaw, lift] of shelves) {
    if (Math.abs(x - cx) > rx + rz || Math.abs(z - cz) > rx + rz) continue;
    const c = Math.cos(yaw),
      s = Math.sin(yaw);
    const u = ((x - cx) * c + (z - cz) * s) / rx,
      v = (-(x - cx) * s + (z - cz) * c) / rz;
    const d = Math.sqrt(u * u + v * v) + ripple;
    extra += lift * (0.26 * (1 - smooth(0.91, 1.25, d)) + 0.74 * (1 - smooth(0.72, 0.93, d)));
  }
  if (x < -215) {
    const inland = shoreDistance(x, z),
      lip = 11.8 + 2.1 * Math.sin(z * 0.19) + 1.8 * Math.cos(z * 0.073);
    const crown = 0.8 + 0.2 * Math.cos(z * 0.15);
    extra +=
      (3.4 + 1.5 * crown) *
      smooth(lip, lip + 2.9, inland) *
      (1 - smooth(22, 42, inland)) *
      (0.48 + 0.52 * smooth(0.1, 0.86, Math.abs(Math.sin(z * 0.067 + 0.24))));
  }
  if (extra) h += extra * (1 - 0.87 * smooth(0.02, 0.95, roadWeight(x, z)));
  if (wet) h *= smooth(1.4, wet.course === 'ocean' ? 6 : 6.35, -wet.bank);
  return Math.min(ceiling, h);
}
const pads = sites.map((b) => ({
  b,
  h: landform(b.x, b.z),
  treads: buildingTreads(b),
  cos: Math.cos(b.yaw),
  sin: Math.sin(b.yaw),
}));
function vertex(i: number, j: number) {
  const key = (i + 2048) * 4096 + j + 2048;
  let h = heights.get(key);
  if (h !== undefined) return h;
  const x = i * step,
    z = j * step;
  h = landform(x, z);
  const wet = waterProfile(x, z);
  if (!wet || wet.bank < -1.4) {
    for (const { b, h: level, cos, sin } of pads) {
      const dx = x - b.x,
        dz = z - b.z;
      if (Math.abs(dx) + Math.abs(dz) > b.w + b.d + 10) continue;
      const outside = Math.max(
        Math.abs(dx * cos - dz * sin) - b.w * 0.5,
        Math.abs(dx * sin + dz * cos) - b.d * 0.5
      );
      if (outside < 4) {
        const weight = (1 - smooth(0.55, 4, outside)) * (wet ? smooth(1.4, 5.4, -wet.bank) : 1);
        h += (level - h) * weight;
      }
    }
  }
  for (const b of crossings) {
    if (Math.abs(x - b.x) + Math.abs(z - b.z) > b.halfLength * 2 + 14) continue;
    const { s, t } = crossingLocal(b, x, z);
    h *= smooth(0.9, 4.75, Math.max(Math.abs(s) - b.halfLength, Math.abs(t) - b.halfWidth));
  }
  heights.set(key, h);
  return h;
}
type Facet = { h: number; dx: number; dz: number };
function facet(x: number, z: number, out: Facet) {
  const i = Math.floor(x / step),
    j = Math.floor(z / step),
    u = x - i * step,
    v = z - j * step;
  const a = vertex(i, j),
    d = vertex(i + 1, j + 1);
  if (u >= v) {
    const b = vertex(i + 1, j);
    out.dx = (b - a) / step;
    out.dz = (d - b) / step;
  } else {
    const c = vertex(i, j + 1);
    out.dx = (d - c) / step;
    out.dz = (c - a) / step;
  }
  out.h = a + out.dx * u + out.dz * v;
  return out;
}
const sample: Facet = { h: 0, dx: 0, dz: 0 };
export const terrainHeight = (x: number, z: number) => facet(x, z, sample).h;
export function terrainSlope(x: number, z: number) {
  const f = facet(x, z, sample);
  return Math.hypot(f.dx, f.dz);
}
/** Floor under a walker's feet, including bridge decks and the modelled front steps. */
export function supportHeight(p: V2) {
  const deck = deckAt(p);
  if (deck) return deckHeight(deck.b, deck.s);
  let height = terrainHeight(p.x, p.z);
  for (const { b, cos, sin, treads } of pads) {
    const dx = p.x - b.x,
      dz = p.z - b.z;
    if (Math.abs(dx) + Math.abs(dz) > b.w + b.d + 2) continue;
    for (const tread of treads)
      if (onSupport(tread, dx * cos - dz * sin, dx * sin + dz * cos))
        height = Math.max(height, terrainHeight(b.x, b.z) + tread.top);
  }
  return height;
}
export function travelScale(x: number, z: number, dx: number, dz: number) {
  const f = facet(x, z, sample),
    grade = f.dx * dx + f.dz * dz;
  return Math.max(0.48, 1 / Math.sqrt(1 + grade * grade) / (1 + 0.1 * Math.max(0, grade)));
}
/** Ledges may be descended. An uphill route must find a sloping approach to a sheer face. */
export function canClimb(from: V2, to: V2) {
  const dx = to.x - from.x,
    dz = to.z - from.z,
    run = Math.hypot(dx, dz);
  if (run < 1e-7) return true;
  // Grid lines and the shared diagonal are the only places where the slope can change.
  const boundary = (value: number, delta: number) => {
    if (Math.abs(delta) < 1e-9) return Infinity;
    const index = delta > 0 ? Math.floor(value / step + 1e-9) + 1 : Math.ceil(value / step - 1e-9) - 1;
    return (index * step - value) / delta;
  };
  const dd = dx - dz;
  let crossX = boundary(from.x, dx),
    crossZ = boundary(from.z, dz),
    crossD = boundary(from.x - from.z, dd),
    start = 0;
  while (start < 1) {
    const end = Math.min(1, crossX, crossZ, crossD),
      mid = (start + end) / 2;
    const f = facet(from.x + mid * dx, from.z + mid * dz, sample);
    if (f.dx * dx + f.dz * dz > 1.56 * run + 1e-7) return false;
    if (crossX <= end + 1e-8) crossX += step / Math.abs(dx);
    if (crossZ <= end + 1e-8) crossZ += step / Math.abs(dz);
    if (crossD <= end + 1e-8) crossD += step / Math.abs(dd);
    start = end;
  }
  return true;
}
export const groundProject = (p: V2) => project(p.x, p.z, terrainHeight(p.x, p.z));

/** At fixed screen X a view ray runs parallel to the diagonal. Only grid boundaries change its triangle. */
function scanColumn(
  sx: number,
  top: number,
  bottom: number,
  span: (y0: number, y1: number, h0: number, h1: number, dx: number, dz: number) => void
) {
  const skew = sx / PROJECTION,
    first = unproject(sx, top - 1).z,
    last = unproject(sx, bottom + ceiling * risePixels + 1).z;
  let z = first;
  let crossX = (Math.floor((z + skew) / step) + 1) * step - skew,
    crossZ = (Math.floor(z / step) + 1) * step;
  const f: Facet = { h: 0, dx: 0, dz: 0 };
  while (z < last) {
    const end = Math.min(crossX, crossZ, last);
    if (end > z + 1e-7) {
      const mid = (z + end) * 0.5;
      facet(mid + skew, mid, f);
      const slope = f.dx + f.dz,
        h0 = f.h + (z - mid) * slope,
        h1 = f.h + (end - mid) * slope;
      const y0 = (z + skew * 0.5) * PROJECTION - h0 * risePixels,
        y1 = (end + skew * 0.5) * PROJECTION - h1 * risePixels;
      if (y1 > y0 && y1 >= top - 1e-7 && y0 <= bottom + 1e-7) span(y0, y1, h0, h1, f.dx, f.dz);
    }
    if (crossX <= end + 1e-7) crossX += step;
    if (crossZ <= end + 1e-7) crossZ += step;
    z = end;
  }
}
/** The nearest visible intersection wins, including when a cliff folds over the land behind it in projection. */
export function pickGround(x: number, y: number): V2 {
  let altitude = 0;
  scanColumn(x, y, y, (a, b, h0, h1) => {
    altitude = h0 + (h1 - h0) * clamp((y - a) / (b - a));
  });
  return unproject(x, y + altitude * risePixels);
}
/** Pick the foremost walkable facet, bridge deck or masonry tread along this screen ray. */
export function pickSurface(x: number, y: number): V2 {
  let hit = pickGround(x, y);
  const deck = pickDeck(unproject(x, y), PROJECTION);
  if (deckAt(deck) && deck.x + deck.z > hit.x + hit.z) hit = deck;
  for (const { b, cos, sin, treads } of pads) {
    if (Math.abs(hit.x - b.x) + Math.abs(hit.z - b.z) > b.w + b.d + 4) continue;
    const floor = terrainHeight(b.x, b.z);
    for (const tread of treads) {
      const p = unproject(x, y + (floor + tread.top) * risePixels);
      const dx = p.x - b.x,
        dz = p.z - b.z;
      if (p.x + p.z > hit.x + hit.z && onSupport(tread, dx * cos - dz * sin, dx * sin + dz * cos)) hit = p;
    }
  }
  return hit;
}
// Interpolate lighting normals across shared vertices while keeping the actual hit surface planar.
interface LightSample {
  tone: number;
  cliff: number;
}
const lighting = new Map<number, LightSample>();
function vertexLight(i: number, j: number) {
  const key = (i + 2048) * 4096 + j + 2048;
  let value = lighting.get(key);
  if (!value) {
    const dx = (vertex(i + 1, j) - vertex(i - 1, j)) / (2 * step),
      dz = (vertex(i, j + 1) - vertex(i, j - 1)) / (2 * step);
    const slope = Math.hypot(dx, dz);
    value = {
      tone: ((0.72 * dx + 0.23 * dz + 0.69) / Math.sqrt(1 + slope * slope) - 0.69) * 142,
      cliff: smooth(0.25, 0.9, slope) * 255,
    };
    lighting.set(key, value);
  }
  return value;
}
function surfaceLight(x: number, z: number, out: LightSample) {
  const i = Math.floor(x / step),
    j = Math.floor(z / step),
    u = x / step - i,
    v = z / step - j;
  const a = vertexLight(i, j),
    d = vertexLight(i + 1, j + 1);
  const across = u >= v ? vertexLight(i + 1, j) : vertexLight(i, j + 1);
  const far = Math.min(u, v),
    side = Math.abs(u - v),
    near = 1 - far - side;
  out.tone = near * a.tone + side * across.tone + far * d.tone;
  out.cliff = near * a.cliff + side * across.cliff + far * d.cliff;
}
export function terrainTile(left: number, top: number, size: number) {
  const elevation = new Float32Array(size * size),
    light = new Int8Array(size * size),
    steepness = new Uint8Array(size * size);
  const first = { tone: 0, cliff: 0 },
    last = { tone: 0, cliff: 0 };
  for (let x = 0; x < size; x++) {
    const sx = left + x;
    scanColumn(sx, top, top + size - 1, (a, b, h0, h1, dx, dz) => {
      const startXZ = unproject(sx, a + h0 * risePixels),
        endXZ = unproject(sx, b + h1 * risePixels);
      surfaceLight(startXZ.x, startXZ.z, first);
      surfaceLight(endXZ.x, endXZ.z, last);
      const plane = 0.12 * ((0.72 * dx + 0.23 * dz + 0.69) / Math.sqrt(1 + dx * dx + dz * dz) - 0.69) * 142;
      const start = Math.max(0, Math.ceil(a - top - 1e-7)),
        end = Math.min(size - 1, Math.floor(b - top + 1e-7));
      for (let y = start; y <= end; y++) {
        const i = y * size + x,
          t = (top + y - a) / (b - a);
        elevation[i] = h0 + (h1 - h0) * t;
        light[i] = Math.max(-105, Math.min(56, plane + 0.88 * (first.tone + (last.tone - first.tone) * t)));
        steepness[i] = first.cliff + (last.cliff - first.cliff) * t;
      }
    });
  }
  return { elevation, light, steepness };
}
