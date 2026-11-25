import { coastX } from '../core/world/coast';
import { ARRIVAL_WRECK, QUARRY_BOULDERS, type V2 } from '../core/world/layout';
import { waterProfile } from './channels';
import { crossings, crossingPoint, deckHeight, pierHalfWidth, pierOffsets } from './crossing';
import { gravelRocks } from './riverHabitat';

export interface StoneObstacle extends V2 {
  radius: number;
  height: number;
}
function rock(p: V2, width: number, coast = false) {
  return {
    ...p,
    width,
    radius: width / (coast ? 22 : 24),
    height: width / (coast ? 42 : 47),
  };
}
export const coastalRocks = (
  [
    [16, 5, 42],
    [21, 8, 24],
    [40, 10, 56],
    [64, 4, 34],
    [-35, 6, 36],
    [90, 7, 55],
  ] as const
).map(([z, offset, width]) => rock({ x: coastX(z) - offset, z }, width, true));

export const riverStones = [
  ...gravelRocks,
  { x: -12.25, z: 2.6, width: 13 },
  { x: -13.7, z: 13.1, width: 10 },
  { x: 32.8, z: -13.8, width: 20 },
  { x: 35.1, z: -9.3, width: 13 },
  { x: 8.4, z: -62, width: 19 },
  { x: 45.6, z: -31.2, width: 12 },
].map((p) => rock(p, p.width));
export const springRock = rock({ x: -11.9, z: -95.5 }, 28);
export const strandWreck = {
  x: coastX(ARRIVAL_WRECK.z) - 0.9,
  z: ARRIVAL_WRECK.z,
  width: 143,
  radius: 2.3,
};
// Smaller quarry stones still make loose bodies. Large boulders are part of the ground.
export const quarryRocks = QUARRY_BOULDERS.filter((p) => p.width * 8 >= 30).map((p) => ({
  ...p,
  width: p.width * 8,
  radius: Math.min(2.3, (p.width * 8) / 22),
  height: Math.min(p.height, (p.width * 8) / 20),
}));
const waterRocks = [...coastalRocks, ...riverStones, springRock];
export const bridgePiers = crossings.flatMap((bridge) =>
  bridge.sills.flatMap((s) =>
    pierOffsets(bridge).map((t) => ({
      ...crossingPoint(bridge, s, t),
      radius: pierHalfWidth * Math.SQRT2,
      height: deckHeight(bridge, s) - 0.5,
      yaw: Math.atan2(-bridge.tz, bridge.tx),
    }))
  )
);

const binSize = 8;
const walkerMargin = 0.25;
const stepHeight = 0.28;
const bins = new Map<number, StoneObstacle[]>();
const binKey = (x: number, z: number) => (x + 1024) * 2048 + z + 1024;
for (const rock of [...waterRocks, ...quarryRocks]) {
  const r = rock.radius + walkerMargin;
  for (let j = Math.floor((rock.z - r) / binSize); j <= Math.floor((rock.z + r) / binSize); j++)
    for (let i = Math.floor((rock.x - r) / binSize); i <= Math.floor((rock.x + r) / binSize); i++) {
      const key = binKey(i, j);
      const row = bins.get(key) ?? [];
      row.push(rock);
      bins.set(key, row);
    }
}
function walkerRadius(rock: StoneObstacle) {
  return rock.radius + walkerMargin;
}
/** Test the whole travel segment. A save embedded in a rock can move out on any outward heading. */
export function passesRocks(from: V2, to: V2, lift = 0) {
  const dx = to.x - from.x,
    dz = to.z - from.z,
    lengthSq = dx * dx + dz * dz;
  if (!lengthSq) return true;
  for (
    let j = Math.floor(Math.min(from.z, to.z) / binSize);
    j <= Math.floor(Math.max(from.z, to.z) / binSize);
    j++
  )
    for (
      let i = Math.floor(Math.min(from.x, to.x) / binSize);
      i <= Math.floor(Math.max(from.x, to.x) / binSize);
      i++
    ) {
      for (const rock of bins.get(binKey(i, j)) ?? []) {
        if (rock.height <= lift + stepHeight) continue;
        const x = from.x - rock.x,
          z = from.z - rock.z,
          dot = x * dx + z * dz;
        if (dot >= 0) continue;
        const t = Math.min(1, -dot / lengthSq);
        if ((x + dx * t) ** 2 + (z + dz * t) ** 2 < walkerRadius(rock) ** 2) return false;
      }
    }
  return true;
}

function rockAt(p: V2) {
  return bins
    .get(binKey(Math.floor(p.x / binSize), Math.floor(p.z / binSize)))
    ?.find((o) => o.height > stepHeight && Math.hypot(p.x - o.x, p.z - o.z) < walkerRadius(o));
}
/** Snap a click on an immovable rock to a clear point on its rim. */
export function rockApproach(target: V2, from: V2): V2 | undefined {
  const rock = rockAt(target);
  if (!rock) return target;
  const direction = Math.atan2(from.z - rock.z, from.x - rock.x),
    r = walkerRadius(rock) + 0.15;
  for (const turn of [0, 0.55, -0.55, 1.1, -1.1, 1.65, -1.65, Math.PI]) {
    const p = { x: rock.x + Math.cos(direction + turn) * r, z: rock.z + Math.sin(direction + turn) * r };
    if (!rockAt(p)) return p;
  }
}

export const contactObstacles = [...waterRocks, ...bridgePiers, strandWreck]
  .map((obstacle) => ({ obstacle, profile: waterProfile(obstacle.x, obstacle.z) }))
  .filter(({ obstacle, profile }) => profile && profile.bank > -Math.min(0.85, obstacle.radius));
