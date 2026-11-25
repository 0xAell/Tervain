import { coastX } from '../core/world/coast';
import { toBuildingLocal } from '../core/world/interiors';
import { BUILDINGS, STREAMS } from '../core/world/layout';
import { SPRING_BASIN, SPRING_RILL } from '../core/world/water/spring';

export type WaterKind = 'sea' | 'shallows' | 'river' | 'pool';
export type Flow = { spring: number; main: number; village: number; quarry: number };
type Course = keyof Flow | 'ocean';
export interface WetPoint {
  kind: WaterKind;
  course: Course;
  along: number;
  across: number;
  /** Signed distance to the mean waterline in metres. Positive points lie under water. */
  bank: number;
  halfWidth: number;
  tx: number;
  tz: number;
}
export const coursesInFrame: readonly Course[] = ['ocean', 'main', 'village', 'quarry', 'spring'];
const bankReach = 1.65,
  riparianReach = 6.4,
  binSize = 12;
interface Segment {
  x: number;
  z: number;
  tx: number;
  tz: number;
  len: number;
  along: number;
  width: number;
  course: keyof Flow;
  left: number;
  right: number;
}
const grid = new Map<number, Segment[]>();
const binKey = (x: number, z: number) => (x + 2000) * 4096 + z + 2000;
function curve(a: number, b: number, c: number, d: number, t: number) {
  return b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * b - 3 * c + d - a)));
}
const reaches: Record<keyof Flow, Segment[]> = { main: [], village: [], quarry: [], spring: [] };
const breadth: Record<keyof Flow, number> = { main: 1.85, village: 1.87, quarry: 1.53, spring: 1.27 };
function drySetback(x: number, z: number, nx: number, nz: number, span: number) {
  const near = BUILDINGS.filter(
    (b) => Math.hypot(b.x - x, b.z - z) < span + Math.hypot(b.w, b.d) * 0.5 + 2.4
  );
  if (!near.length) return span;
  for (let d = 0.4; d <= span; d += 0.25)
    for (const b of near) {
      const p = toBuildingLocal(b, x + nx * d, z + nz * d);
      if (Math.abs(p.x) < b.w / 2 + 1 && p.z > -b.d / 2 - 1 && p.z < b.d / 2 + 1.85)
        return Math.max(0.45, d - 0.25);
    }
  return span;
}
const bendCottage = BUILDINGS.find((b) => b.id === 'house_d')!;
for (const stream of [...STREAMS, { id: 'spring' as const, points: SPRING_RILL, halfWidth: 0.78 }]) {
  const points = stream.id === 'quarry' ? [...stream.points].reverse() : stream.points;
  let along = 0,
    last = points[0]!;
  for (let j = 0; j + 1 < points.length; j++) {
    const a = points[Math.max(0, j - 1)]!,
      b = points[j]!,
      c = points[j + 1]!,
      d = points[Math.min(points.length - 1, j + 2)]!;
    const n = Math.ceil(Math.hypot(c.x - b.x, c.z - b.z) / 2.1);
    for (let k = 1; k <= n; k++) {
      const z = curve(a.z, b.z, c.z, d.z, k / n);
      // The mill race bends east of the cottage forecourt before rejoining its lower reach.
      const bend =
        stream.id === 'village'
          ? 3.15 * Math.exp(-(((z - bendCottage.z - bendCottage.d / 2) / 7.1) ** 2))
          : 0;
      const x = curve(a.x, b.x, c.x, d.x, k / n) + bend;
      const len = Math.hypot(x - last.x, z - last.z);
      // The spring feeds a narrow headwater before the main stem opens into the valley.
      const release = stream.id === 'main' ? Math.min(1, (along + len * 0.5) / 18) : 1;
      const opening = 0.48 + 0.52 * release * release * (3 - 2 * release);
      const width = stream.halfWidth * breadth[stream.id] * opening,
        tx = (x - last.x) / len,
        tz = (z - last.z) / len;
      const mx = (x + last.x) / 2,
        mz = (z + last.z) / 2;
      const seg = {
        x: last.x,
        z: last.z,
        tx,
        tz,
        len,
        along,
        width,
        left: drySetback(mx, mz, -tz, tx, width * 1.3),
        right: drySetback(mx, mz, tz, -tx, width * 1.3),
        course: stream.id,
      };
      reaches[stream.id].push(seg);
      const reach = width * 1.3 + riparianReach;
      for (
        let i = Math.floor((Math.min(last.x, x) - reach) / binSize);
        i <= Math.floor((Math.max(last.x, x) + reach) / binSize);
        i++
      )
        for (
          let h = Math.floor((Math.min(last.z, z) - reach) / binSize);
          h <= Math.floor((Math.max(last.z, z) + reach) / binSize);
          h++
        ) {
          const key = binKey(i, h),
            bucket = grid.get(key) ?? [];
          bucket.push(seg);
          grid.set(key, bucket);
        }
      along += len;
      last = { x, z };
    }
  }
}
const coastline = new Map<number, number>();
function shoreline(z: number) {
  const lower = Math.floor(z * 4),
    f = z * 4 - lower;
  const value = (index: number) => {
    let v = coastline.get(index);
    if (v === undefined) {
      v = coastX(index / 4);
      coastline.set(index, v);
    }
    return v;
  };
  return value(lower) * (1 - f) + value(lower + 1) * f;
}

/** Includes the exposed intertidal shelf for rendering. Game logic uses wetPoint for the mean waterline. */
export function waterProfile(x: number, z: number): WetPoint | null {
  if (x < -140) {
    const bank = shoreline(z) - x;
    if (bank >= -bankReach)
      return {
        kind: bank > 3 ? 'sea' : 'shallows',
        course: 'ocean',
        along: x,
        across: z,
        bank,
        halfWidth: 0,
        tx: 0,
        tz: 0,
      };
  }
  let found: WetPoint | null = null;
  const dz = z - SPRING_BASIN.z,
    dx = x - SPRING_BASIN.x;
  if (Math.abs(dx) < 6 && Math.abs(dz) < 6) {
    const rad = SPRING_BASIN.r + 0.19 * Math.sin(dx * 1.15 + dz * 0.56);
    const bank = rad - Math.hypot(dx, dz);
    if (bank >= -bankReach)
      found = { kind: 'pool', course: 'spring', along: x, across: z, bank, halfWidth: rad, tx: 0, tz: 0 };
  }
  const segments = grid.get(binKey(Math.floor(x / binSize), Math.floor(z / binSize)));
  if (!segments) return found;
  for (const s of segments) {
    const px = x - s.x,
      pz = z - s.z,
      t = Math.max(0, Math.min(s.len, px * s.tx + pz * s.tz));
    const along = s.along + t,
      across = pz * s.tx - px * s.tz;
    const width = Math.min(
      across >= 0 ? s.left : s.right,
      s.width *
        (1 + 0.112 * Math.sin(along * 0.206) + 0.061 * Math.sin(along * 0.67 + (across > 0 ? 0.9 : 0)))
    );
    const bank = width - Math.hypot(px - s.tx * t, pz - s.tz * t);
    if (bank < -riparianReach || (found && bank <= found.bank)) continue;
    found = { kind: 'river', course: s.course, along, across, bank, halfWidth: width, tx: s.tx, tz: s.tz };
  }
  return found;
}
export function wetPoint(x: number, z: number) {
  const p = waterProfile(x, z);
  return p && p.bank > 0 ? p : null;
}

/** Sample along the same curved channel used for water, vegetation and aquatic animals. */
export function channelPoint(course: keyof Flow, station: number, offset = 0) {
  const segments = reaches[course],
    last = segments[segments.length - 1]!;
  const d = Math.max(0, Math.min(last.along + last.len, station));
  let lo = 0,
    hi = segments.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (segments[mid]!.along <= d) lo = mid;
    else hi = mid - 1;
  }
  const s = segments[lo]!;
  return {
    x: s.x + (d - s.along) * s.tx - offset * s.tz,
    z: s.z + (d - s.along) * s.tz + offset * s.tx,
    tx: s.tx,
    tz: s.tz,
    width: s.width,
  };
}
export function channelLength(course: keyof Flow) {
  const last = reaches[course][reaches[course].length - 1]!;
  return last.along + last.len;
}
