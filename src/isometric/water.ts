import { coastX } from '../core/world/coast';
import { DECKS, STREAMS, type V2 } from '../core/world/layout';
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
}
export const coursesInFrame: readonly Course[] = ['ocean', 'main', 'village', 'quarry', 'spring'];
const bankReach = 1.65,
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
}
const grid = new Map<number, Segment[]>();
const binKey = (x: number, z: number) => (x + 2000) * 4096 + z + 2000;
function curve(a: number, b: number, c: number, d: number, t: number) {
  return b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * b - 3 * c + d - a)));
}
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
      const x = curve(a.x, b.x, c.x, d.x, k / n),
        z = curve(a.z, b.z, c.z, d.z, k / n);
      const len = Math.hypot(x - last.x, z - last.z);
      const seg = {
        x: last.x,
        z: last.z,
        tx: (x - last.x) / len,
        tz: (z - last.z) / len,
        len,
        along,
        width: stream.halfWidth,
        course: stream.id,
      };
      const reach = stream.halfWidth * 1.3 + bankReach;
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
      };
  }
  let found: WetPoint | null = null;
  const dz = z - SPRING_BASIN.z,
    dx = x - SPRING_BASIN.x;
  if (Math.abs(dx) < 6 && Math.abs(dz) < 6) {
    const rad = SPRING_BASIN.r + 0.19 * Math.sin(dx * 1.15 + dz * 0.56);
    const bank = rad - Math.hypot(dx, dz);
    if (bank >= -bankReach)
      found = { kind: 'pool', course: 'spring', along: x, across: z, bank, halfWidth: rad };
  }
  const segments = grid.get(binKey(Math.floor(x / binSize), Math.floor(z / binSize)));
  if (!segments) return found;
  for (const s of segments) {
    const px = x - s.x,
      pz = z - s.z,
      t = Math.max(0, Math.min(s.len, px * s.tx + pz * s.tz));
    const along = s.along + t,
      across = pz * s.tx - px * s.tz;
    const width =
      s.width *
      (1 + 0.112 * Math.sin(along * 0.206) + 0.061 * Math.sin(along * 0.67 + (across > 0 ? 0.9 : 0)));
    const bank = width - Math.hypot(px - s.tx * t, pz - s.tz * t);
    if (bank < -bankReach || (found && bank <= found.bank)) continue;
    found = { kind: 'river', course: s.course, along, across, bank, halfWidth: width };
  }
  return found;
}
export function wetPoint(x: number, z: number) {
  const p = waterProfile(x, z);
  return p && p.bank > 0 ? p : null;
}
export function onBridge(p: V2) {
  return DECKS.some((deck) => {
    const dx = p.x - deck.x,
      dz = p.z - deck.z,
      c = Math.cos(deck.yaw),
      s = Math.sin(deck.yaw);
    return Math.abs(dx * c - dz * s) <= deck.hx && Math.abs(dx * s + dz * c) <= deck.hz;
  });
}
export const riverStones = [
  { x: -12.25, z: 2.6, width: 13 },
  { x: -13.7, z: 13.1, width: 10 },
  { x: 32.8, z: -13.8, width: 20 },
  { x: 35.1, z: -9.3, width: 13 },
  { x: 8.4, z: -62, width: 19 },
  { x: 45.6, z: -31.2, width: 12 },
] as const;
const obstacles = riverStones.map((s) => ({ profile: waterProfile(s.x, s.z), radius: s.width / 16 }));
/** Signed cross-stream deflection around a wash stone and a recirculating pocket downstream. */
export function stoneFlow(w: WetPoint) {
  let deflection = 0,
    eddy = 0;
  for (const stone of obstacles) {
    if (!stone.profile || stone.profile.course !== w.course) continue;
    const ahead = w.along - stone.profile.along,
      side = w.across - stone.profile.across;
    if (ahead < -2.2 || ahead > 6.5 || Math.abs(side) > 3.4) continue;
    const r = stone.radius,
      d = Math.sqrt((ahead / r) ** 2 * 0.39 + (side / r) ** 2);
    deflection += (side < 0 ? -1 : 1) * Math.exp(-d * d * 0.62) * r;
    if (ahead > 0) eddy = Math.max(eddy, Math.exp(-ahead * 0.4 - side * side * 1.2));
  }
  return { deflection, eddy };
}
export function waveFrame(phase: number, count: number) {
  if (count < 2) return 0;
  const period = 2 * (count - 1),
    position = ((Math.floor(phase) % period) + period) % period;
  return position < count ? position : period - position;
}
