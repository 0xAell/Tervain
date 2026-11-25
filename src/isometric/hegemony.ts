import { buildingEntry } from '../core/world/buildingEntries';
import { toBuildingLocal } from '../core/world/interiors';
import {
  ARRIVAL_SIGN,
  BUILDINGS,
  FIELDS,
  FOREST_RUIN,
  HUNTER_CAMP,
  PLACES,
  ROADS,
  SLUICE,
  WAGON,
  WELL,
  frontOf,
  type RoadSpec,
  type V2,
} from '../core/world/layout';
import { realmRadius, roadWeight } from '../core/world/terrain';
import { waterProfile } from './channels';
import { crossings, crossingLocal, crossingPoint } from './crossing';
import { risePixels } from './projection';
import { terrainHeight } from './relief';

type Post = 'standard_court' | 'standard_watch' | 'standard_road';
export type StandardKey = Post | 'standard_wall';
export const standardSize = {
  standard_court: { width: 36, height: 58, radius: 0.29 },
  standard_watch: { width: 28, height: 49, radius: 0.23 },
  standard_road: { width: 22, height: 37, radius: 0.18 },
  standard_wall: { width: 24, height: 27, radius: 0 },
} satisfies Record<StandardKey, { width: number; height: number; radius: number }>;
export const isHegemonyStandard = (key: string): key is StandardKey => Object.hasOwn(standardSize, key);
export interface Standard extends V2 {
  key: StandardKey;
  width: number;
  phase: number;
  chart?: boolean;
  lift?: number;
  elevation?: number;
  flip?: boolean;
}

const distance = (a: V2, b: V2) => Math.hypot(a.x - b.x, a.z - b.z);
const phaseAt = (p: V2) => ((p.x * 47 + p.z * 23) & 15) + 3;
const dryStandingGround = (p: V2) => {
  if (roadWeight(p.x, p.z) > 0.14 || realmRadius(p.x, p.z) > 0.98) return false;
  if ((waterProfile(p.x, p.z)?.bank ?? -10) > -0.62) return false;
  for (const bridge of crossings) {
    const { s, t } = crossingLocal(bridge, p.x, p.z);
    if (Math.abs(s) < bridge.halfLength + 0.4 && Math.abs(t) < bridge.halfWidth + 1.2) return false;
  }
  for (const b of BUILDINGS) {
    if (Math.abs(p.x - b.x) + Math.abs(p.z - b.z) > b.w + b.d + 10) continue;
    const local = toBuildingLocal(b, p.x, p.z);
    if (Math.abs(local.x) < b.w / 2 + 1.25 && local.z > -b.d / 2 - 1 && local.z < b.d / 2 + 2.35)
      return false;
  }
  for (const f of FIELDS) {
    const local = toBuildingLocal(f, p.x, p.z);
    if (Math.abs(local.x) < f.w / 2 + 0.65 && Math.abs(local.z) < f.d / 2 + 0.65) return false;
  }
  return ![WELL, WAGON, HUNTER_CAMP, SLUICE.control].some((point) => distance(p, point) < 2.2);
};

const standards: Standard[] = [];
function setPost(key: Post, point: V2, chart: boolean, spacing: number) {
  if (!dryStandingGround(point) || standards.some((p) => distance(p, point) < spacing)) return false;
  const phase = phaseAt(point);
  standards.push({ ...point, key, width: standardSize[key].width, chart, phase, flip: phase % 2 === 1 });
  return true;
}
function landmark(key: Post, center: V2, offsets: readonly (readonly [number, number])[], chart = true) {
  for (const [x, z] of offsets) if (setPost(key, { x: center.x + x, z: center.z + z }, chart, 4.6)) return;
}

landmark('standard_watch', ARRIVAL_SIGN, [
  [-1.6, -3],
  [-0.3, 3.1],
  [2.9, -1.9],
]);
landmark('standard_watch', PLACES.lantern_point, [
  [2.2, 9],
  [5, 11.4],
  [3, 3.4],
]);
landmark('standard_watch', FOREST_RUIN, [
  [-1.8, 7.1],
  [3.5, 7.8],
  [-7, 5],
]);
landmark('standard_watch', PLACES.overlook, [
  [-1, 2],
  [2, 4.8],
  [0.6, -4.7],
]);
landmark('standard_court', PLACES.rillford, [
  [3.8, 6.6],
  [-2.8, 5.4],
  [-8.1, 6.6],
]);
landmark(
  'standard_court',
  PLACES.rillford,
  [
    [-5.7, -0.3],
    [-8.4, 6.3],
    [9, -1.8],
    [8.1, 5.8],
  ],
  false
);
landmark('standard_court', WAGON, [
  [5.2, 3],
  [1.2, 5.4],
  [6.6, -0.8],
]);
landmark('standard_court', PLACES.spring_shrine, [
  [-16.8, 1.3],
  [3.2, 2.8],
  [4.5, -1.3],
  [-2.1, -2.8],
]);
landmark('standard_watch', SLUICE.control, [
  [-4.5, 3.1],
  [-2.2, -3.6],
  [-4.9, -4],
]);
landmark('standard_court', PLACES.quarry, [
  [-2.1, 4.8],
  [-0.5, -5.1],
  [3, 3.3],
]);
landmark('standard_watch', PLACES.the_cut, [
  [4, 3.7],
  [2.7, -5],
  [-3.3, -2.5],
]);
landmark('standard_watch', PLACES.ford, [
  [3, 2],
  [-3.7, 5.1],
  [-3.7, -1.3],
]);
landmark('standard_watch', { x: 119, z: 68 }, [
  [2.3, -3.8],
  [4.4, 2.5],
  [-3, 4.3],
]);
for (const bridge of crossings) {
  for (const end of [-1, 1]) {
    const s = end * (bridge.halfLength + 1.6),
      t = bridge.halfWidth + 1.8;
    for (const edge of [end, -end])
      if (setPost('standard_watch', crossingPoint(bridge, s, edge * t), end > 0, 4.6)) break;
  }
}

/** Put a banner on the verge at regular intervals along each of the travelled roads. */
function lineRoad(road: RoadSpec) {
  let walked = 0,
    next = 12,
    side = 1;
  for (let i = 1; i < road.points.length; i++) {
    const a = road.points[i - 1]!,
      b = road.points[i]!;
    const length = distance(a, b),
      tx = (b.x - a.x) / length,
      tz = (b.z - a.z) / length,
      verge = road.width * 0.5 + 2.1;
    while (next < walked + length) {
      const x = a.x + tx * (next - walked),
        z = a.z + tz * (next - walked);
      for (const offset of [side * verge, -side * verge, side * (verge + 1.9)]) {
        if (setPost('standard_road', { x: x - tz * offset, z: z + tx * offset }, false, 11.5)) break;
      }
      side *= -1;
      next += 24;
    }
    walked += length;
  }
}
for (const road of ROADS) lineRoad(road);

const wallSites = new Set([
  'reeve_house',
  'shrine_hall',
  'archive',
  'quarry_office',
  'inn',
  'overlook_lodge',
  'fisher_house',
  'net_store',
]);
for (const b of BUILDINGS) {
  if (!wallSites.has(b.id)) continue;
  const key = 'standard_wall',
    side = buildingEntry(b).x > 0 ? -1 : 1,
    outside = frontOf(b, 0.3, side * (b.w * 0.5 - 1.3)),
    size = standardSize[key],
    eave = Math.round(b.h * risePixels),
    width = Math.min(size.width, Math.floor(((eave - 3) * size.width) / size.height));
  standards.push({
    ...outside,
    key,
    width,
    phase: phaseAt(outside),
    flip: b.yaw > 0.4,
    elevation: terrainHeight(b.x, b.z),
    lift: eave - Math.round((size.height * width) / size.width),
    chart: b.id === 'archive',
  });
}

export const hegemonyStandards: readonly Standard[] = standards;
